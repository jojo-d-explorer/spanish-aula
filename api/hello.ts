import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
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

  const testMessage =
    typeof req.body?.message === 'string' && req.body.message.trim().length > 0
      ? req.body.message
      : 'Hola. Please reply with one short, friendly sentence in Spanish.';

  try {
    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', // cheap/fast — wiring test only, not a grading call
      max_tokens: 200,
      messages: [{ role: 'user', content: testMessage }],
    });

    await logUsage({
      tab: 'wiring_test',
      model: 'claude-haiku-4-5-20251001',
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
    }).catch((err) => console.error('Usage logging error:', err));

    const reply = completion.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    res.status(200).json({ reply });
  } catch (err) {
    console.error('Anthropic API error:', err);
    res.status(500).json({ error: 'Failed to reach Claude. Check server logs.' });
  }
}
