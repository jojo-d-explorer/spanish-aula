import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { buildLessonSystemPrompt } from '../src/shared/lessons/rubric.js';
import { appendLessonMessage, fetchLessonThread } from '../src/shared/db/lessons.js';
import { getSettings } from '../src/shared/db/settings.js';
import type { LessonMessage } from '../src/shared/lessons/types.js';
import { logUsage } from '../src/shared/db/usage.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) {
    res.status(400).json({ error: 'id query parameter is required.' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const thread = await fetchLessonThread(id);
      if (!thread) {
        res.status(404).json({ error: 'Lesson not found.' });
        return;
      }
      const { messages, ...lesson } = thread;
      res.status(200).json({ lesson, messages });
    } catch (err) {
      console.error('Lesson thread fetch error:', err);
      res.status(500).json({ error: 'Failed to load lesson. Check server logs.' });
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

  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) {
    res.status(400).json({ error: 'content is required.' });
    return;
  }

  try {
    const thread = await fetchLessonThread(id);
    if (!thread) {
      res.status(404).json({ error: 'Lesson not found.' });
      return;
    }

    // Level is pinned to the thread's own creation-time snapshot (PRD §9.6)
    // — never the learner's current global settings — so an old thread is
    // never silently regenerated at a newer level. This endpoint has no
    // path for the client to override it. Dialect is re-read fresh since
    // it's a stable variety preference, not a growth-record axis.
    const settings = await getSettings();

    const userMessage = await appendLessonMessage({ lessonId: id, role: 'user', content });

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-5', // lessons → Sonnet, per CLAUDE.md model routing
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: buildLessonSystemPrompt(settings.dialect, thread.deleLevelAtCreation),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        ...thread.messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content },
      ],
    });

    await logUsage({
      tab: 'lesson_thread_reply',
      model: 'claude-sonnet-5',
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
    }).catch((err) => console.error('Usage logging error:', err));

    const textBlock = completion.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    if (!textBlock) {
      res.status(502).json({ error: 'Lesson did not return a reply.' });
      return;
    }

    let assistantMessage: LessonMessage | null = null;
    let persistError: string | undefined;
    try {
      assistantMessage = await appendLessonMessage({ lessonId: id, role: 'assistant', content: textBlock.text });
    } catch (err) {
      console.error('Persistence error:', err);
      persistError = 'Reply generated but could not be saved.';
    }

    res.status(200).json({ userMessage, assistantMessage, persistError });
  } catch (err) {
    console.error('Anthropic lesson reply error:', err);
    res.status(500).json({ error: 'Failed to generate reply. Check server logs.' });
  }
}
