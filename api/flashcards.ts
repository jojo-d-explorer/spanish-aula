import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { buildFlashcardGenerationSystemPrompt, FLASHCARD_GENERATION_TOOL } from '../src/shared/flashcards/rubric.js';
import { FLASHCARD_SOURCES, type FlashcardSource, type FlashcardSourceItem } from '../src/shared/flashcards/types.js';
import {
  listFlashcards,
  listFlashcardTerms,
  persistFlashcards,
  markFlashcardsExported,
  markWordBankExported,
  type FlashcardInput,
} from '../src/shared/db/flashcards.js';
import { normalizeForMatch } from '../src/shared/workbook/matching.js';
import { isDeleLevel, type DialectCode, type DeleLevel } from '../src/shared/prompts/writingPrompt.js';
import { ERROR_CATEGORIES, type ErrorCategory } from '../src/shared/grading/types.js';
import { logUsage } from '../src/shared/db/usage.js';
import { requireAccess } from '../src/shared/auth/accessGate.js';

// Three routes (generate / list / export) share one file — Vercel's Hobby
// plan caps a deployment at 12 serverless functions, and Phase 5's three
// separate files pushed the project to 15. Method + ?export query param
// dispatch, same technique already used by api/word-bank.ts for GET/POST.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function isFlashcardSource(value: unknown): value is FlashcardSource {
  return (FLASHCARD_SOURCES as readonly unknown[]).includes(value);
}

function isErrorCategory(value: unknown): value is ErrorCategory {
  return (ERROR_CATEGORIES as readonly unknown[]).includes(value);
}

interface RawGeneratedCard {
  id: string;
  translation: string;
  example_sentence: string;
  category: string;
}

// TSV-only this phase (PRD §14.5) — no header row, so it matches Anki's
// plain "Notes in Plain Text (.txt)" import expectations directly. Tabs and
// newlines inside a field would break the format, so they're stripped —
// none of term/translation/example_sentence should legitimately contain
// either, but a stray one from generation shouldn't corrupt the file.
function tsvField(value: string): string {
  return value.replace(/[\t\n\r]+/g, ' ').trim();
}

async function handleGenerate(req: VercelRequest, res: VercelResponse) {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY.' });
    return;
  }

  const dialect: DialectCode = req.body?.dialect === 'rio' ? 'rio' : 'mx';
  const deleLevel: DeleLevel = isDeleLevel(req.body?.deleLevel) ? req.body.deleLevel : 'A2';
  const source = req.body?.source;
  const rawItems = Array.isArray(req.body?.items) ? (req.body.items as unknown[]) : [];

  if (!isFlashcardSource(source)) {
    res.status(400).json({ error: `source must be one of ${FLASHCARD_SOURCES.join(', ')}.` });
    return;
  }

  const items: FlashcardSourceItem[] = rawItems
    .map((raw) => {
      const item = raw as Partial<FlashcardSourceItem>;
      const sourceNote = typeof item.sourceNote === 'string' ? item.sourceNote.trim() : '';
      if (!sourceNote) return null;
      return {
        sourceNote,
        sourceWordBankId:
          source === 'word_bank' && typeof item.sourceWordBankId === 'string' ? item.sourceWordBankId : null,
      };
    })
    .filter((item): item is FlashcardSourceItem => item !== null);

  if (items.length === 0) {
    res.status(400).json({ error: 'items must be a non-empty array of { sourceNote }.' });
    return;
  }

  try {
    const batchIds = items.map((_, i) => `item-${i}`);
    const userMessage = items.map((item, i) => `${batchIds[i]}: ${item.sourceNote}`).join('\n');

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // workbook + flashcard generation → Haiku, per CLAUDE.md model routing
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: buildFlashcardGenerationSystemPrompt(dialect, deleLevel),
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [FLASHCARD_GENERATION_TOOL],
      tool_choice: { type: 'tool', name: 'generate_flashcards' },
      messages: [{ role: 'user', content: userMessage }],
    });

    await logUsage({
      tab: 'flashcards_generate',
      model: 'claude-haiku-4-5-20251001',
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
    }).catch((err) => console.error('Usage logging error:', err));

    const toolUse = completion.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    if (!toolUse) {
      res.status(502).json({ error: 'Generator did not return a structured result.' });
      return;
    }

    const rawCards = (toolUse.input as { cards: RawGeneratedCard[] }).cards;
    const cardById = new Map(rawCards.map((c) => [c.id, c]));

    // Existing terms + terms newly added within this same batch — both
    // checked so an intra-batch repeat (two Word Bank entries with the same
    // term) is caught too, not just repeats against already-persisted rows.
    const existingTerms = new Set((await listFlashcardTerms()).map(normalizeForMatch));

    const inputs: FlashcardInput[] = items.map((item, i) => {
      const raw = cardById.get(batchIds[i]);
      const normalizedTerm = normalizeForMatch(item.sourceNote);
      const isDuplicate = existingTerms.has(normalizedTerm);
      existingTerms.add(normalizedTerm);

      return {
        term: item.sourceNote,
        translation: raw?.translation ?? '',
        exampleSentence: raw?.example_sentence ?? '',
        category: isErrorCategory(raw?.category) ? raw.category : null,
        dialect,
        deleLevel,
        source,
        sourceWordBankId: item.sourceWordBankId,
        sourceNote: item.sourceNote,
        dedupStatus: isDuplicate ? 'duplicate' : 'pending',
      };
    });

    const flashcards = await persistFlashcards(inputs);
    res.status(200).json({ flashcards });
  } catch (err) {
    console.error('Flashcard generation error:', err);
    res.status(500).json({ error: 'Failed to generate flashcards. Check server logs.' });
  }
}

async function handleExport(res: VercelResponse) {
  try {
    const all = await listFlashcards();
    const pending = all.filter((card) => card.dedupStatus === 'pending');

    if (pending.length === 0) {
      res.status(422).json({ error: 'No pending flashcards to export — generate some first.' });
      return;
    }

    const tsv = pending
      .map((card) => [tsvField(card.term), tsvField(card.translation), tsvField(card.exampleSentence)].join('\t'))
      .join('\n');

    const wordBankIds = pending.map((card) => card.sourceWordBankId).filter((id): id is string => id !== null);

    await markFlashcardsExported(pending.map((card) => card.id));
    await markWordBankExported(wordBankIds);

    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="aula-flashcards.tsv"');
    res.status(200).send(tsv);
  } catch (err) {
    console.error('Flashcard export error:', err);
    res.status(500).json({ error: 'Failed to export flashcards. Check server logs.' });
  }
}

async function handleList(res: VercelResponse) {
  try {
    const flashcards = await listFlashcards();
    res.status(200).json({ flashcards });
  } catch (err) {
    console.error('Flashcard list error:', err);
    res.status(500).json({ error: 'Failed to load flashcards. Check server logs.' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAccess(req, res)) return;

  if (req.method === 'POST') {
    await handleGenerate(req, res);
    return;
  }

  if (req.method === 'GET') {
    if (req.query.export !== undefined) {
      await handleExport(res);
    } else {
      await handleList(res);
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
}
