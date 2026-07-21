import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import {
  buildWorkbookGenerationSystemPrompt,
  buildWorkbookClassifierSystemPrompt,
  WORKBOOK_GENERATION_TOOL,
  WORKBOOK_CLASSIFIER_TOOL,
} from '../src/shared/workbook/rubric.js';
import { fetchHistoryData } from '../src/shared/db/history.js';
import { computeTrends } from '../src/shared/history/trends.js';
import { resolveAutoCategory } from '../src/shared/workbook/sourcing.js';
import { isDeleLevel, type DialectCode, type DeleLevel } from '../src/shared/prompts/writingPrompt.js';
import { ERROR_CATEGORIES, type ErrorCategory } from '../src/shared/grading/types.js';
import { logUsage } from '../src/shared/db/usage.js';
import type { WorkbookSession, WorkbookSessionSource, ExerciseItem } from '../src/shared/workbook/types.js';
import { requireAccess } from '../src/shared/auth/accessGate.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Fixed default mix — cloze passages are the centerpiece (PRD §10.2) and,
// since the blank-count rule (rubric.ts) now routes all genuinely multi-blank/
// complex sentences through contextual_cloze exclusively (conjugation_recall/
// gap_fill are strictly single-blank), two passages instead of one keeps
// session difficulty from dropping now that those types can't carry
// multi-verb complexity themselves. conjugation/gap-fill give volume
// drilling, one sentence-production item produces the richest error-log
// signal. Tunable, not PRD-pinned.
const DEFAULT_ITEM_COUNTS: Record<string, number> = {
  contextual_cloze: 2,
  conjugation_recall: 2,
  gap_fill: 2,
  sentence_production: 1,
};

function isErrorCategory(value: unknown): value is ErrorCategory {
  return (ERROR_CATEGORIES as readonly unknown[]).includes(value);
}

interface RawGeneratedItem {
  type: string;
  category: string;
  prompt: string;
  rationale: string;
  passage: string;
  blanks: { cue: string; answer: string }[];
  sentence: string;
  verb_infinitive: string;
  person: string;
  cue: string;
  answer: string;
  question: string;
}

// rubric.ts's "Cue rule" tells the model verb_infinitive/cue is the bare
// target only, person goes in its own field — confirmed live that Haiku
// doesn't reliably follow this and sometimes appends "(nosotros)" etc.
// straight onto verb_infinitive, which the UI renders as a double
// parenthesis next to the input. Same reliability gap as the blank-count
// and empty-cue rules above; strip rather than trust the prompt alone.
function stripTrailingParenthetical(value: string): string {
  return value.replace(/\s*\([^()]*\)\s*$/, '').trim();
}

function toExerciseItem(raw: RawGeneratedItem, fallbackCategory: ErrorCategory): ExerciseItem {
  const category = isErrorCategory(raw.category) ? raw.category : fallbackCategory;
  const base = { id: randomUUID(), category, prompt: raw.prompt, rationale: raw.rationale };

  switch (raw.type) {
    case 'contextual_cloze':
      return {
        ...base,
        type: 'contextual_cloze',
        passage: raw.passage,
        blanks: raw.blanks.map((b) => ({ id: randomUUID(), cue: b.cue, answer: b.answer })),
      };
    case 'conjugation_recall':
      return {
        ...base,
        type: 'conjugation_recall',
        sentence: raw.sentence,
        verbInfinitive: stripTrailingParenthetical(raw.verb_infinitive),
        person: raw.person,
        answer: raw.answer,
      };
    case 'gap_fill':
      return {
        ...base,
        type: 'gap_fill',
        sentence: raw.sentence,
        cue: stripTrailingParenthetical(raw.cue),
        answer: raw.answer,
      };
    case 'sentence_production':
    default:
      return {
        ...base,
        type: 'sentence_production',
        question: raw.question,
      };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAccess(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY.' });
    return;
  }

  const dialect: DialectCode = req.body?.dialect === 'rio' ? 'rio' : 'mx';
  const deleLevel: DeleLevel = isDeleLevel(req.body?.deleLevel) ? req.body.deleLevel : 'A2';
  const sourceInput = req.body?.source;

  if (!sourceInput || (sourceInput.kind !== 'auto' && sourceInput.kind !== 'freeform')) {
    res.status(400).json({ error: 'source.kind must be "auto" or "freeform".' });
    return;
  }

  try {
    let source: WorkbookSessionSource;

    if (sourceInput.kind === 'auto') {
      const categoryOverride = isErrorCategory(sourceInput.categoryOverride) ? sourceInput.categoryOverride : null;

      if (categoryOverride) {
        source = { kind: 'auto', category: categoryOverride, reason: 'deep-link' };
      } else {
        const { observations, sophisticationRecords } = await fetchHistoryData();
        const trends = computeTrends(observations, sophisticationRecords);
        const resolved = resolveAutoCategory(trends);
        if (!resolved) {
          res
            .status(422)
            .json({ error: 'Not enough history yet to auto-select a category — try a freeform request.' });
          return;
        }
        source = { kind: 'auto', category: resolved.category, reason: resolved.reason };
      }
    } else {
      const requestText = typeof sourceInput.requestText === 'string' ? sourceInput.requestText.trim() : '';
      if (!requestText) {
        res.status(400).json({ error: 'source.requestText is required for freeform sourcing.' });
        return;
      }

      const classificationCompletion = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', // workbook → Haiku, per CLAUDE.md model routing
        max_tokens: 128,
        system: [
          { type: 'text', text: buildWorkbookClassifierSystemPrompt(), cache_control: { type: 'ephemeral' } },
        ],
        tools: [WORKBOOK_CLASSIFIER_TOOL],
        tool_choice: { type: 'tool', name: 'classify_workbook_request' },
        messages: [{ role: 'user', content: requestText }],
      });

      await logUsage({
        tab: 'workbook_classifier',
        model: 'claude-haiku-4-5-20251001',
        inputTokens: classificationCompletion.usage.input_tokens,
        outputTokens: classificationCompletion.usage.output_tokens,
      }).catch((err) => console.error('Usage logging error:', err));

      const classifierToolUse = classificationCompletion.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      if (!classifierToolUse) {
        res.status(502).json({ error: 'Classifier did not return a structured result.' });
        return;
      }

      const raw = classifierToolUse.input as { category: string };
      const category = isErrorCategory(raw.category) ? raw.category : 'other';
      source = { kind: 'freeform', category, reason: requestText };
    }

    const itemCountsDescription = Object.entries(DEFAULT_ITEM_COUNTS)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    const userMessage = `Target category: ${source.category}\nGenerate: ${itemCountsDescription}\nDialect: ${dialect}\nLevel: ${deleLevel}`;

    const generationCompletion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // workbook generation → Haiku, per CLAUDE.md model routing
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: buildWorkbookGenerationSystemPrompt(dialect, deleLevel),
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [WORKBOOK_GENERATION_TOOL],
      tool_choice: { type: 'tool', name: 'generate_workbook_session' },
      messages: [{ role: 'user', content: userMessage }],
    });

    await logUsage({
      tab: 'workbook_session_gen',
      model: 'claude-haiku-4-5-20251001',
      inputTokens: generationCompletion.usage.input_tokens,
      outputTokens: generationCompletion.usage.output_tokens,
    }).catch((err) => console.error('Usage logging error:', err));

    const genToolUse = generationCompletion.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!genToolUse) {
      res.status(502).json({ error: 'Generator did not return a structured result.' });
      return;
    }

    const rawItems = (genToolUse.input as { items: RawGeneratedItem[] }).items;
    const items: ExerciseItem[] = rawItems
      .map((raw) => toExerciseItem(raw, source.category))
      .filter((item) => {
        // Prompt-level instruction (rubric.ts "Blank-count rule") isn't
        // reliably followed by Haiku — confirmed live: it still sometimes
        // writes a second blank into a conjugation_recall/gap_fill sentence,
        // which only has one answer field and renders one input box. Drop
        // rather than present an ungradeable item; a session with one fewer
        // item beats a broken one.
        if (item.type !== 'conjugation_recall' && item.type !== 'gap_fill') return true;
        const blankCount = (item.sentence.match(/_{2,}/g) ?? []).length;
        if (blankCount > 1) {
          console.warn(`Dropping malformed ${item.type} item — ${blankCount} blanks but one answer field:`, item.sentence);
          return false;
        }
        // Same reliability gap as the blank-count rule (rubric.ts "Cue
        // rule") — the model sometimes leaves the target verb unspecified,
        // which used to be invisible: the UI only ever rendered `sentence`,
        // so a missing cue meant the learner had no way to know which verb
        // was being tested, yet was still graded against one fixed answer.
        // ExerciseSession.tsx/ResultsView.tsx now always render the
        // structured cue field explicitly, but that only helps if it's
        // actually populated — drop the item if it isn't.
        const cue = item.type === 'conjugation_recall' ? item.verbInfinitive : item.cue;
        if (!cue.trim()) {
          console.warn(`Dropping malformed ${item.type} item — no verb cue specified:`, item.sentence);
          return false;
        }
        return true;
      });

    const session: WorkbookSession = { source, dialect, deleLevel, items };
    res.status(200).json({ session });
  } catch (err) {
    console.error('Anthropic workbook session error:', err);
    res.status(500).json({ error: 'Failed to generate workbook session. Check server logs.' });
  }
}
