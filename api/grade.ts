import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import {
  isCompleteGradingContract,
  isCompleteUptakeBlock,
  type GradingContract,
  type RevisionGradingContract,
} from '../src/shared/grading/types.js';
import { buildGradingSystemPrompt, buildUptakeInstructionsBlock, GRADING_TOOL, REVISION_GRADING_TOOL } from '../src/shared/grading/rubric.js';
import {
  persistGradedEntry,
  getEntryForRevision,
  getFlaggedObservationsForRevision,
  persistRevisionEntry,
} from '../src/shared/db/entries.js';
import { isDeleLevel, type DialectCode, type DeleLevel } from '../src/shared/prompts/writingPrompt.js';
import { logUsage } from '../src/shared/db/usage.js';
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

  // Phase 8 (PRD §9) — revision grading shares this route rather than adding
  // a new api/ file (Hobby-plan 12-function ceiling, CLAUDE.md).
  const parentEntryId = typeof req.body?.parentEntryId === 'string' ? req.body.parentEntryId : null;
  if (parentEntryId) {
    await handleRevisionGrading(req, res, parentEntryId);
    return;
  }

  const entryText = typeof req.body?.entryText === 'string' ? req.body.entryText.trim() : '';
  const promptText = typeof req.body?.promptText === 'string' ? req.body.promptText.trim() : '';
  const dialect: DialectCode = req.body?.dialect === 'rio' ? 'rio' : 'mx';
  const deleLevel: DeleLevel = isDeleLevel(req.body?.deleLevel) ? req.body.deleLevel : 'A2';

  if (!entryText) {
    res.status(400).json({ error: 'entryText is required.' });
    return;
  }
  if (!promptText) {
    res.status(400).json({ error: 'promptText is required.' });
    return;
  }

  try {
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-5', // grading → Sonnet, per CLAUDE.md model routing
      max_tokens: 8192,
      system: [
        {
          type: 'text',
          text: buildGradingSystemPrompt(dialect, deleLevel),
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [GRADING_TOOL],
      tool_choice: { type: 'tool', name: 'submit_grading' },
      messages: [{ role: 'user', content: entryText }],
    });

    await logUsage({
      tab: 'writing_grade',
      model: 'claude-sonnet-5',
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
    }).catch((err) => console.error('Usage logging error:', err));

    const toolUse = completion.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUse) {
      res.status(502).json({ error: 'Grader did not return a structured result.' });
      return;
    }

    const rawGrading = toolUse.input;
    if (completion.stop_reason === 'max_tokens' || !isCompleteGradingContract(rawGrading)) {
      console.error('Truncated or incomplete grading result', {
        stop_reason: completion.stop_reason,
        input: rawGrading,
      });
      res.status(502).json({ error: 'Grading response was cut off before it finished — please try again.' });
      return;
    }

    const grading: GradingContract = rawGrading;

    let entryId: string | null = null;
    let persistError: string | undefined;
    try {
      entryId = await persistGradedEntry({ dialect, deleLevel, promptText, entryText, grading });
    } catch (err) {
      // Grading already succeeded and cost real tokens — show the feedback
      // regardless, but flag that it wasn't saved.
      console.error('Persistence error:', err);
      persistError = 'Entry graded but could not be saved.';
    }

    res.status(200).json({ ...grading, entryId, persistError });
  } catch (err) {
    console.error('Anthropic grading error:', err);
    res.status(500).json({ error: 'Failed to grade entry. Check server logs.' });
  }
}

// Phase 8 (PRD §9.6) — second grading pass on a revision: standard grading
// contract (§4, unchanged) plus an additive `uptake` block. Model: Sonnet —
// this is judgment work, not volume.
async function handleRevisionGrading(req: VercelRequest, res: VercelResponse, parentEntryId: string) {
  const entryText = typeof req.body?.entryText === 'string' ? req.body.entryText.trim() : '';
  const revealedCorrections = req.body?.revealedCorrections === true;

  if (!entryText) {
    res.status(400).json({ error: 'entryText is required.' });
    return;
  }

  const parent = await getEntryForRevision(parentEntryId).catch((err) => {
    console.error('Failed to load parent entry for revision:', err);
    return undefined;
  });
  if (parent === undefined) {
    res.status(500).json({ error: 'Failed to load the entry being revised. Check server logs.' });
    return;
  }
  if (parent === null) {
    res.status(404).json({ error: 'The entry being revised was not found.' });
    return;
  }

  // Not persisted as a distinct edge case (PRD §9.9's "parent grading was
  // truncated" is already unreachable here): a truncated grading result is
  // rejected below, before persistGradedEntry/persistRevisionEntry ever
  // run, so no row in `entries` can ever represent a truncated grade.
  const flagged = await getFlaggedObservationsForRevision(parentEntryId).catch((err) => {
    console.error('Failed to load flagged observations for revision:', err);
    return undefined;
  });
  if (flagged === undefined) {
    res.status(500).json({ error: 'Failed to load the errors being revised. Check server logs.' });
    return;
  }

  try {
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 8192,
      system: [
        {
          type: 'text',
          text: buildGradingSystemPrompt(parent.dialect, parent.deleLevel),
          cache_control: { type: 'ephemeral' },
        },
        {
          // Deliberately not cached — this list is different on every
          // revision call (see buildUptakeInstructionsBlock).
          type: 'text',
          text: buildUptakeInstructionsBlock(flagged),
        },
      ],
      tools: [REVISION_GRADING_TOOL],
      tool_choice: { type: 'tool', name: 'submit_grading' },
      messages: [{ role: 'user', content: entryText }],
    });

    await logUsage({
      tab: 'writing_revision_grade',
      model: 'claude-sonnet-5',
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
    }).catch((err) => console.error('Usage logging error:', err));

    const toolUse = completion.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) {
      res.status(502).json({ error: 'Grader did not return a structured result.' });
      return;
    }

    const rawGrading = toolUse.input as Record<string, unknown>;
    const expectedCount = flagged.length;

    if (
      completion.stop_reason === 'max_tokens' ||
      !isCompleteGradingContract(rawGrading) ||
      !isCompleteUptakeBlock(rawGrading.uptake, expectedCount)
    ) {
      console.error('Truncated or incomplete revision grading result', {
        stop_reason: completion.stop_reason,
        expectedCount,
        input: rawGrading,
      });
      res.status(502).json({ error: 'Revision grading response was cut off before it finished — please try again.' });
      return;
    }

    const grading = rawGrading as unknown as RevisionGradingContract;

    // PRD §9.6 — "not more, not fewer": isCompleteUptakeBlock already
    // checked the count; this checks the *identity* of each id, since the
    // model echoes ids rather than generating them and must never invent or
    // drop one, even while hitting the right count.
    const flaggedIds = new Set(flagged.map((f) => f.id));
    const resolvedIds = new Set(grading.uptake.resolutions.map((r) => r.observation_id));
    const idsMatch =
      resolvedIds.size === grading.uptake.resolutions.length &&
      flaggedIds.size === resolvedIds.size &&
      [...flaggedIds].every((id) => resolvedIds.has(id));

    if (!idsMatch) {
      console.error('Uptake resolution id mismatch — failing the write rather than persisting a partial set', {
        flaggedIds: [...flaggedIds],
        resolvedIds: [...resolvedIds],
      });
      res.status(502).json({ error: 'Revision grading returned mismatched uptake resolutions — please try again.' });
      return;
    }

    let entryId: string | null = null;
    let persistError: string | undefined;
    try {
      entryId = await persistRevisionEntry({
        parentEntryId,
        parentRevisionNumber: parent.revisionNumber,
        promptText: parent.promptText,
        dialect: parent.dialect,
        deleLevel: parent.deleLevel,
        entryText,
        revealedCorrections,
        grading,
      });
    } catch (err) {
      console.error('Revision persistence error:', err);
      persistError = 'Revision graded but could not be saved.';
    }

    res.status(200).json({ ...grading, entryId, parentEntryId, persistError });
  } catch (err) {
    console.error('Anthropic revision grading error:', err);
    res.status(500).json({ error: 'Failed to grade revision. Check server logs.' });
  }
}
