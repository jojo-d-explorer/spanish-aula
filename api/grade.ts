import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { ERROR_CATEGORIES } from '../src/shared/grading/types';
import { buildGradingSystemPrompt } from '../src/shared/grading/rubric';
import type { DialectCode, DeleLevel } from '../src/shared/prompts/writingPrompt';

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
            properties: {
              syntactic_complexity: { type: 'integer', minimum: 1, maximum: 10 },
              verbal_range: { type: 'integer', minimum: 1, maximum: 10 },
              lexical_sophistication: { type: 'integer', minimum: 1, maximum: 10 },
              cohesion: { type: 'integer', minimum: 1, maximum: 10 },
              ambition: { type: 'integer', minimum: 1, maximum: 10 },
            },
            required: ['syntactic_complexity', 'verbal_range', 'lexical_sophistication', 'cohesion', 'ambition'],
          },
          notes: { type: 'string' },
        },
        required: ['overall', 'subscores', 'notes'],
      },
      feedback_prose: { type: 'string' },
      dele_level_estimate: { type: 'string' },
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
  const dialect: DialectCode = req.body?.dialect === 'rio' ? 'rio' : 'mx';
  const deleLevel: DeleLevel = ['A2', 'B1', 'B2'].includes(req.body?.deleLevel) ? req.body.deleLevel : 'A2';

  if (!entryText) {
    res.status(400).json({ error: 'entryText is required.' });
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

    res.status(200).json(toolUse.input);
  } catch (err) {
    console.error('Anthropic grading error:', err);
    res.status(500).json({ error: 'Failed to grade entry. Check server logs.' });
  }
}
