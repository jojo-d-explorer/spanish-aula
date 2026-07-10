import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { buildGradingSystemPrompt, GRADING_TOOL } from '../src/shared/grading/rubric.js';
import { buildNearMissJudgeSystemPrompt, WORKBOOK_NEAR_MISS_TOOL } from '../src/shared/workbook/rubric.js';
import { normalizeForMatch, isNearMissCandidate } from '../src/shared/workbook/matching.js';
import { persistWorkbookObservations } from '../src/shared/db/workbook.js';
import type { WorkbookObservationInput } from '../src/shared/db/workbook.js';
import { logUsage } from '../src/shared/db/usage.js';
import { isDeleLevel, type DialectCode, type DeleLevel } from '../src/shared/prompts/writingPrompt.js';
import { isCompleteGradingContract, type GradingContract } from '../src/shared/grading/types.js';
import type {
  ExerciseItem,
  ObjectiveAnswer,
  ObjectiveGradeResult,
  SentenceProductionAnswer,
  SentenceProductionGradeResult,
  WorkbookGradeResponse,
} from '../src/shared/workbook/types.js';
import { requireAccess } from '../src/shared/auth/accessGate.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  const items = Array.isArray(req.body?.items) ? (req.body.items as ExerciseItem[]) : [];
  const answers = Array.isArray(req.body?.answers) ? (req.body.answers as ObjectiveAnswer[]) : [];
  const sentenceProductionAnswers = Array.isArray(req.body?.sentenceProductionAnswers)
    ? (req.body.sentenceProductionAnswers as SentenceProductionAnswer[])
    : [];

  if (items.length === 0) {
    res.status(400).json({ error: 'items is required.' });
    return;
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));

  try {
    // --- Objective grading: auto-match first, batch near-misses for one LLM call ---
    interface PendingNearMiss {
      answer: ObjectiveAnswer;
      correctAnswer: string;
    }
    const autoResults: ObjectiveGradeResult[] = [];
    const nearMissBatch: PendingNearMiss[] = [];

    for (const answer of answers) {
      const item = itemsById.get(answer.itemId);
      if (!item) continue;

      let correctAnswer: string | null = null;
      if (item.type === 'contextual_cloze' && answer.blankId) {
        const blank = item.blanks.find((b) => b.id === answer.blankId);
        correctAnswer = blank?.answer ?? null;
      } else if (item.type === 'conjugation_recall' || item.type === 'gap_fill') {
        correctAnswer = item.answer;
      }
      if (correctAnswer === null) continue;

      if (normalizeForMatch(answer.submitted) === normalizeForMatch(correctAnswer)) {
        autoResults.push({ ...answer, correct: true, correctAnswer, matchMethod: 'auto' });
      } else if (isNearMissCandidate(answer.submitted, correctAnswer)) {
        nearMissBatch.push({ answer, correctAnswer });
      } else {
        autoResults.push({ ...answer, correct: false, correctAnswer, matchMethod: 'auto' });
      }
    }

    let nearMissResults: ObjectiveGradeResult[] = [];
    if (nearMissBatch.length > 0) {
      const batchIds = nearMissBatch.map((_, i) => `item-${i}`);
      const batchMessage = nearMissBatch
        .map((p, i) => `${batchIds[i]}: submitted "${p.answer.submitted}", correct answer "${p.correctAnswer}"`)
        .join('\n');

      const nearMissCompletion = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', // workbook → Haiku, per CLAUDE.md model routing
        max_tokens: 1024,
        system: [
          { type: 'text', text: buildNearMissJudgeSystemPrompt(dialect), cache_control: { type: 'ephemeral' } },
        ],
        tools: [WORKBOOK_NEAR_MISS_TOOL],
        tool_choice: { type: 'tool', name: 'judge_near_misses' },
        messages: [{ role: 'user', content: batchMessage }],
      });

      await logUsage({
        tab: 'workbook_near_miss',
        model: 'claude-haiku-4-5-20251001',
        inputTokens: nearMissCompletion.usage.input_tokens,
        outputTokens: nearMissCompletion.usage.output_tokens,
      }).catch((err) => console.error('Usage logging error:', err));

      const toolUse = nearMissCompletion.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      const verdicts =
        (toolUse?.input as { verdicts: { id: string; correct: boolean; note: string }[] } | undefined)?.verdicts ??
        [];
      const verdictById = new Map(verdicts.map((v) => [v.id, v]));

      nearMissResults = nearMissBatch.map((p, i) => {
        const verdict = verdictById.get(batchIds[i]);
        return {
          ...p.answer,
          correct: verdict?.correct ?? false,
          correctAnswer: p.correctAnswer,
          matchMethod: 'llm_near_miss' as const,
          note: verdict?.note,
        };
      });
    }

    const objective = [...autoResults, ...nearMissResults];

    // --- Sentence-production grading: exact same pipeline as Writing ---
    const sentenceProduction: SentenceProductionGradeResult[] = [];
    for (const answer of sentenceProductionAnswers) {
      const item = itemsById.get(answer.itemId);
      if (!item || item.type !== 'sentence_production') continue;

      const gradeCompletion = await anthropic.messages.create({
        model: 'claude-sonnet-5', // grading → Sonnet, per CLAUDE.md model routing
        max_tokens: 8192,
        system: [
          { type: 'text', text: buildGradingSystemPrompt(dialect, deleLevel), cache_control: { type: 'ephemeral' } },
        ],
        tools: [GRADING_TOOL],
        tool_choice: { type: 'tool', name: 'submit_grading' },
        messages: [{ role: 'user', content: answer.submitted }],
      });

      await logUsage({
        tab: 'workbook_sentence_grade',
        model: 'claude-sonnet-5',
        inputTokens: gradeCompletion.usage.input_tokens,
        outputTokens: gradeCompletion.usage.output_tokens,
      }).catch((err) => console.error('Usage logging error:', err));

      const toolUse = gradeCompletion.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      if (!toolUse) continue;

      const rawGrading = toolUse.input;
      if (gradeCompletion.stop_reason === 'max_tokens' || !isCompleteGradingContract(rawGrading)) {
        console.error('Truncated or incomplete sentence-production grading result', {
          stop_reason: gradeCompletion.stop_reason,
          input: rawGrading,
        });
        continue;
      }

      const grading: GradingContract = rawGrading;
      sentenceProduction.push({ itemId: answer.itemId, submitted: answer.submitted, grading });
    }

    // --- Persist all resulting observations into the shared error_observations table ---
    const observations: WorkbookObservationInput[] = [
      ...objective.map((r) => ({
        category: itemsById.get(r.itemId)?.category ?? 'other',
        obligatoryContext: true,
        correct: r.correct,
        excerpt: r.submitted,
        correction: r.correctAnswer,
        note: r.note ?? '',
        portugueseInterference: false,
      })),
      ...sentenceProduction.flatMap((r) =>
        r.grading.accuracy.observations.map((obs) => ({
          category: obs.category,
          obligatoryContext: obs.obligatory_context,
          correct: obs.correct,
          excerpt: obs.excerpt,
          correction: obs.correction,
          note: obs.note,
          portugueseInterference: obs.portuguese_interference,
        })),
      ),
    ];

    let persistError: string | undefined;
    try {
      await persistWorkbookObservations(observations);
    } catch (err) {
      // Grading already succeeded and cost real tokens — show results
      // regardless, but flag that they weren't saved.
      console.error('Persistence error:', err);
      persistError = 'Session graded but could not be saved.';
    }

    const response: WorkbookGradeResponse = { objective, sentenceProduction, persistError };
    res.status(200).json(response);
  } catch (err) {
    console.error('Anthropic workbook grading error:', err);
    res.status(500).json({ error: 'Failed to grade workbook session. Check server logs.' });
  }
}
