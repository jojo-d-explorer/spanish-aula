import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { ERROR_CATEGORIES, DELE_LEVELS, SUBSCORE_KEYS, type GradingContract } from '../src/shared/grading/types.js';
import { buildGradingSystemPrompt } from '../src/shared/grading/rubric.js';
import { persistGradedEntry } from '../src/shared/db/entries.js';
import { isDeleLevel, type DialectCode, type DeleLevel } from '../src/shared/prompts/writingPrompt.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORY_SUMMARY_ENTRY_SCHEMA = {
  type: 'object',
  properties: {
    obligatory_contexts: { type: 'integer' },
    correct: { type: 'integer' },
  },
  required: ['obligatory_contexts', 'correct'],
};

const GRADING_TOOL: Anthropic.Tool = {
  name: 'submit_grading',
  description: "Submit the complete grading assessment of the learner's Spanish entry.",
  input_schema: {
    type: 'object',
    properties: {
      corrected_text: { type: 'string' },
      accuracy: {
        type: 'object',
        properties: {
          observations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                category: { type: 'string', enum: ERROR_CATEGORIES as unknown as string[] },
                obligatory_context: { type: 'boolean' },
                correct: { type: 'boolean' },
                excerpt: { type: 'string' },
                correction: { type: 'string' },
                note: { type: 'string' },
                portuguese_interference: { type: 'boolean' },
              },
              required: [
                'category',
                'obligatory_context',
                'correct',
                'excerpt',
                'correction',
                'note',
                'portuguese_interference',
              ],
            },
          },
          category_summary: {
            type: 'object',
            description: 'Keyed by error category; include only categories that had at least one obligatory context in this entry.',
            additionalProperties: CATEGORY_SUMMARY_ENTRY_SCHEMA,
          },
        },
        required: ['observations', 'category_summary'],
      },
      sophistication: {
        type: 'object',
        properties: {
          overall: { type: 'integer', minimum: 1, maximum: 10 },
          subscores: {
            type: 'object',
            properties: Object.fromEntries(
              SUBSCORE_KEYS.map((key) => [key, { type: 'integer', minimum: 1, maximum: 10 }]),
            ),
            required: SUBSCORE_KEYS as unknown as string[],
          },
          notes: { type: 'string' },
        },
        required: ['overall', 'subscores', 'notes'],
      },
      feedback_prose: { type: 'string' },
      dele_level_estimate: { type: 'string', enum: DELE_LEVELS as unknown as string[] },
    },
    required: ['corrected_text', 'accuracy', 'sophistication', 'feedback_prose', 'dele_level_estimate'],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      max_tokens: 4096,
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

    const toolUse = completion.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUse) {
      res.status(502).json({ error: 'Grader did not return a structured result.' });
      return;
    }

    const grading = toolUse.input as GradingContract;

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
