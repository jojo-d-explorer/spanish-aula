import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { isCompleteGradingContract, type GradingContract } from '../src/shared/grading/types.js';
import { buildGradingSystemPrompt, GRADING_TOOL } from '../src/shared/grading/rubric.js';
import { persistGradedEntry } from '../src/shared/db/entries.js';
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
