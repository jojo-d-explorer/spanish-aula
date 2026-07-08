import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { ERROR_CATEGORIES, type ErrorCategory } from '../src/shared/grading/types.js';
import { buildLessonSystemPrompt, buildLessonClassifierSystemPrompt } from '../src/shared/lessons/rubric.js';
import { createLessonThread, fetchLessonLog } from '../src/shared/db/lessons.js';
import { isDeleLevel, type DialectCode, type DeleLevel } from '../src/shared/prompts/writingPrompt.js';
import type { LessonClassification, LessonMessage } from '../src/shared/lessons/types.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LESSON_CLASSIFIER_TOOL: Anthropic.Tool = {
  name: 'classify_lesson_request',
  description:
    "Classify the learner's freeform lesson request as macro (a grammar/structure topic mapping to the frozen taxonomy) or micro (a narrow lexical point).",
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['macro', 'micro'] },
      topic_category: {
        type: 'string',
        description: "Set when kind is 'macro'; empty string otherwise.",
        enum: [...ERROR_CATEGORIES, ''] as unknown as string[],
      },
      topic_freeform: {
        type: 'string',
        description: "Set when kind is 'micro' (short 2-6 word label); empty string otherwise.",
      },
    },
    required: ['kind', 'topic_category', 'topic_freeform'],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    try {
      const lessons = await fetchLessonLog();
      res.status(200).json({ lessons });
    } catch (err) {
      console.error('Lesson log fetch error:', err);
      res.status(500).json({ error: 'Failed to load lessons. Check server logs.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY.' });
    return;
  }

  const requestText = typeof req.body?.requestText === 'string' ? req.body.requestText.trim() : '';
  const dialect: DialectCode = req.body?.dialect === 'rio' ? 'rio' : 'mx';
  const deleLevel: DeleLevel = isDeleLevel(req.body?.deleLevel) ? req.body.deleLevel : 'A2';

  if (!requestText) {
    res.status(400).json({ error: 'requestText is required.' });
    return;
  }

  try {
    const classificationCompletion = await anthropic.messages.create({
      model: 'claude-sonnet-5', // lessons → Sonnet, per CLAUDE.md model routing
      max_tokens: 256,
      system: [
        {
          type: 'text',
          text: buildLessonClassifierSystemPrompt(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [LESSON_CLASSIFIER_TOOL],
      tool_choice: { type: 'tool', name: 'classify_lesson_request' },
      messages: [{ role: 'user', content: requestText }],
    });

    const classifierToolUse = classificationCompletion.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!classifierToolUse) {
      res.status(502).json({ error: 'Classifier did not return a structured result.' });
      return;
    }

    const rawClassification = classifierToolUse.input as {
      kind: 'macro' | 'micro';
      topic_category: string;
      topic_freeform: string;
    };
    const classification: LessonClassification = {
      kind: rawClassification.kind,
      topicCategory: rawClassification.topic_category ? (rawClassification.topic_category as ErrorCategory) : null,
      topicFreeform: rawClassification.topic_freeform ? rawClassification.topic_freeform : null,
    };

    const replyCompletion = await anthropic.messages.create({
      model: 'claude-sonnet-5', // lessons → Sonnet, per CLAUDE.md model routing
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: buildLessonSystemPrompt(dialect, deleLevel),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: requestText }],
    });

    const replyTextBlock = replyCompletion.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    if (!replyTextBlock) {
      res.status(502).json({ error: 'Lesson did not return a reply.' });
      return;
    }

    // Fallback messages so the client can still render the (already-paid-for)
    // reply even if persistence below fails — mirrors grade.ts's
    // separable-failure pattern.
    const now = new Date().toISOString();
    let messages: LessonMessage[] = [
      { id: randomUUID(), lessonId: '', role: 'user', content: requestText, createdAt: now },
      { id: randomUUID(), lessonId: '', role: 'assistant', content: replyTextBlock.text, createdAt: now },
    ];
    let lessonId: string | null = null;
    let persistError: string | undefined;

    try {
      const created = await createLessonThread({
        topicCategory: classification.topicCategory,
        topicFreeform: classification.topicFreeform,
        deleLevelAtCreation: deleLevel,
        openingUserMessage: requestText,
        openingAssistantMessage: replyTextBlock.text,
      });
      lessonId = created.lessonId;
      messages = created.messages;
    } catch (err) {
      console.error('Persistence error:', err);
      persistError = 'Lesson generated but could not be saved.';
    }

    res.status(200).json({ lessonId, classification, messages, persistError });
  } catch (err) {
    console.error('Anthropic lessons error:', err);
    res.status(500).json({ error: 'Failed to generate lesson. Check server logs.' });
  }
}
