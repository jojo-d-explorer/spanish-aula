import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { buildFlashcardGenerationSystemPrompt, FLASHCARD_GENERATION_TOOL } from '../src/shared/flashcards/rubric.js';
import {
  FLASHCARD_SOURCES,
  FLASHCARD_STATUSES,
  type FlashcardSource,
  type FlashcardSourceItem,
  type FlashcardStatus,
} from '../src/shared/flashcards/types.js';
import { NOTE_TYPES, DECK_LABELS, SPANISH_VERB_FIELDS, GENERAL_WORD_FIELDS, type AnkiNoteType } from '../src/shared/flashcards/ankiSchema.js';
import {
  listFlashcards,
  persistDraftFlashcards,
  updateFlashcard,
  confirmFlashcards,
  rejectFlashcards,
  markFlashcardsExported,
  listKnownCardTerms,
  seedKnownCards,
  type FlashcardDraftInput,
} from '../src/shared/db/flashcards.js';
import { normalizeForMatch } from '../src/shared/workbook/matching.js';
import { isDeleLevel, type DialectCode, type DeleLevel } from '../src/shared/prompts/writingPrompt.js';
import { logUsage } from '../src/shared/db/usage.js';
import { requireAccess } from '../src/shared/auth/accessGate.js';

// All Flashcards routes share one file — Vercel's Hobby plan caps a
// deployment at 12 serverless functions (CLAUDE.md Conventions). Method +
// query-param dispatch, same technique already used by api/word-bank.ts.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function isFlashcardSource(value: unknown): value is FlashcardSource {
  return (FLASHCARD_SOURCES as readonly unknown[]).includes(value);
}

function isFlashcardStatus(value: unknown): value is FlashcardStatus {
  return (FLASHCARD_STATUSES as readonly unknown[]).includes(value);
}

function isNoteType(value: unknown): value is AnkiNoteType {
  return (NOTE_TYPES as readonly unknown[]).includes(value);
}

interface RawGeneratedCard {
  id: string;
  out_of_scope: boolean;
  out_of_scope_reason: string;
  note_type: string;
  deck: string;
  tags: string[];
  Word: string;
  ExampleSentence: string;
  Definitions: string;
  ConjPresenteFormula: string;
  ConjPresente: string;
  ConjPreteritoFormula: string;
  ConjPreterito: string;
  ConjFuturoFormula: string;
  ConjFuturo: string;
  ConjIrA: string;
  Collocations: string;
  ReflexiveNote: string;
}

// docs/ANKI_SCHEMA.md §3 — 5-line header, field order load-bearing (TSV
// import maps by column position, not header name). Tabs/newlines inside a
// field would break the format; stripped defensively, same as the original
// export function.
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

  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

  const items: FlashcardSourceItem[] = rawItems
    .map((raw): FlashcardSourceItem | null => {
      const item = raw as Partial<FlashcardSourceItem>;
      const sourceNote = typeof item.sourceNote === 'string' ? item.sourceNote.trim() : '';
      if (!sourceNote) return null;
      return {
        sourceNote,
        sourceWordBankId:
          source === 'word_bank' && typeof item.sourceWordBankId === 'string' ? item.sourceWordBankId : null,
        sourceDate: typeof item.sourceDate === 'string' && DATE_ONLY.test(item.sourceDate) ? item.sourceDate : null,
      };
    })
    .filter((item): item is FlashcardSourceItem => item !== null);

  if (items.length === 0) {
    res.status(400).json({ error: 'items must be a non-empty array of { sourceNote }.' });
    return;
  }

  try {
    // Dedup happens BEFORE generation (docs/ANKI_SCHEMA.md §7) — a term
    // already in known_cards is flagged and never sent to the model.
    const knownTerms = new Set((await listKnownCardTerms()).map(normalizeForMatch));
    const alreadyKnown: string[] = [];
    const toGenerate = items.filter((item) => {
      if (knownTerms.has(normalizeForMatch(item.sourceNote))) {
        alreadyKnown.push(item.sourceNote);
        return false;
      }
      return true;
    });

    if (toGenerate.length === 0) {
      res.status(200).json({ drafts: [], alreadyKnown });
      return;
    }

    const batchIds = toGenerate.map((_, i) => `item-${i}`);
    const userMessage = toGenerate
      .map((item, i) => {
        const dateSuffix = item.sourceDate ? ` (captured ${item.sourceDate})` : '';
        return `${batchIds[i]}: ${item.sourceNote}${dateSuffix}`;
      })
      .join('\n');

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-5', // flashcard content generation → Sonnet, deliberate exception (CLAUDE.md Hard Rules)
      max_tokens: 8192,
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
      model: 'claude-sonnet-5',
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

    const inputs: FlashcardDraftInput[] = toGenerate.map((item, i) => {
      const raw = cardById.get(batchIds[i]);
      const outOfScope = raw?.out_of_scope ?? true;

      if (!raw || outOfScope) {
        return {
          outOfScope: true,
          outOfScopeReason: raw?.out_of_scope_reason || 'Generator did not return a result for this item.',
          noteType: null,
          deck: null,
          term: item.sourceNote,
          fields: null,
          tags: [],
          dialect,
          deleLevel,
          source,
          sourceWordBankId: item.sourceWordBankId,
          sourceNote: item.sourceNote,
        };
      }

      const fields = Object.fromEntries(SPANISH_VERB_FIELDS.map((field) => [field, raw[field] ?? '']));

      return {
        outOfScope: false,
        outOfScopeReason: null,
        noteType: isNoteType(raw.note_type) ? raw.note_type : null,
        deck: DECK_LABELS.includes(raw.deck) ? raw.deck : null,
        term: raw.Word || item.sourceNote,
        fields,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        dialect,
        deleLevel,
        source,
        sourceWordBankId: item.sourceWordBankId,
        sourceNote: item.sourceNote,
      };
    });

    const drafts = await persistDraftFlashcards(inputs);
    res.status(200).json({ drafts, alreadyKnown });
  } catch (err) {
    console.error('Flashcard generation error:', err);
    res.status(500).json({ error: 'Failed to generate flashcards. Check server logs.' });
  }
}

async function handleSeed(req: VercelRequest, res: VercelResponse) {
  const rawItems = Array.isArray(req.body?.items) ? (req.body.items as unknown[]) : [];
  const items = rawItems
    .map((raw) => {
      const item = raw as { noteText?: unknown; deckName?: unknown };
      const term = typeof item.noteText === 'string' ? item.noteText.trim() : '';
      const deck = typeof item.deckName === 'string' ? item.deckName.trim() : '';
      if (!term) return null;
      return { term, deck };
    })
    .filter((item): item is { term: string; deck: string } => item !== null);

  if (items.length === 0) {
    res.status(400).json({ error: 'items must be a non-empty array of { noteText, deckName }.' });
    return;
  }

  try {
    const result = await seedKnownCards(items, normalizeForMatch);
    res.status(200).json(result);
  } catch (err) {
    console.error('Flashcard seed error:', err);
    res.status(500).json({ error: 'Failed to seed known_cards. Check server logs.' });
  }
}

async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) {
    res.status(400).json({ error: 'id query param is required.' });
    return;
  }

  const noteType = isNoteType(req.body?.noteType) ? req.body.noteType : undefined;
  const deck = typeof req.body?.deck === 'string' && DECK_LABELS.includes(req.body.deck) ? req.body.deck : undefined;
  const tags = Array.isArray(req.body?.tags) ? (req.body.tags as string[]) : undefined;

  try {
    await updateFlashcard(id, { noteType, deck, tags });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Flashcard update error:', err);
    res.status(500).json({ error: 'Failed to update flashcard. Check server logs.' });
  }
}

function parseIds(req: VercelRequest): string[] {
  return Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((id): id is string => typeof id === 'string') : [];
}

async function handleConfirm(req: VercelRequest, res: VercelResponse) {
  const ids = parseIds(req);
  if (ids.length === 0) {
    res.status(400).json({ error: 'ids must be a non-empty array.' });
    return;
  }
  try {
    await confirmFlashcards(ids);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Flashcard confirm error:', err);
    res.status(500).json({ error: 'Failed to confirm flashcards. Check server logs.' });
  }
}

async function handleReject(req: VercelRequest, res: VercelResponse) {
  const ids = parseIds(req);
  if (ids.length === 0) {
    res.status(400).json({ error: 'ids must be a non-empty array.' });
    return;
  }
  try {
    await rejectFlashcards(ids);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Flashcard reject error:', err);
    res.status(500).json({ error: 'Failed to reject flashcards. Check server logs.' });
  }
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const status = isFlashcardStatus(req.query.status) ? req.query.status : undefined;
  try {
    const flashcards = await listFlashcards(status);
    res.status(200).json({ flashcards });
  } catch (err) {
    console.error('Flashcard list error:', err);
    res.status(500).json({ error: 'Failed to load flashcards. Check server logs.' });
  }
}

async function handleExportGroup(req: VercelRequest, res: VercelResponse) {
  const deck = typeof req.query.deck === 'string' ? req.query.deck : '';
  const noteType = typeof req.query.noteType === 'string' ? req.query.noteType : '';

  if (!DECK_LABELS.includes(deck) || !isNoteType(noteType)) {
    res.status(400).json({ error: 'deck and noteType query params must match a real deck/note type.' });
    return;
  }

  try {
    const confirmed = await listFlashcards('confirmed');
    const group = confirmed.filter((card) => card.deck === deck && card.noteType === noteType);

    if (group.length === 0) {
      res.status(422).json({ error: 'No confirmed flashcards in this group to export.' });
      return;
    }

    const fieldOrder = noteType === 'Spanish Verb' ? SPANISH_VERB_FIELDS : GENERAL_WORD_FIELDS;
    const rows = group.map((card) => {
      const fieldValues = fieldOrder.map((field) => tsvField(card.fields?.[field] ?? ''));
      const tagsValue = tsvField(card.tags.join(' '));
      return [...fieldValues, tagsValue].join('\t');
    });

    // docs/ANKI_SCHEMA.md §3 — deck names transcribed from the §1 table
    // (with spaces, e.g. "01 Verbs - Irregular"); the doc's own §3 example
    // line abbreviates hyphens differently ("01 Verbs-Irregular") — flagged
    // as a real ambiguity, using the table's naming here since it's the
    // more authoritative section. Easy to fix in ankiSchema.ts if wrong.
    const header = [
      '#separator:tab',
      '#html:true',
      `#notetype:${noteType}`,
      `#deck:Spanish Frequency::${deck}`,
      `#tags column:${fieldOrder.length + 1}`,
    ].join('\n');

    const tsv = `${header}\n${rows.join('\n')}`;

    await markFlashcardsExported(group.map((card) => card.id));

    const safeFilename = `${deck.replace(/[^a-z0-9]+/gi, '_')}_${noteType.replace(/[^a-z0-9]+/gi, '_')}.tsv`;
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.status(200).send(tsv);
  } catch (err) {
    console.error('Flashcard export error:', err);
    res.status(500).json({ error: 'Failed to export flashcards. Check server logs.' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAccess(req, res)) return;

  if (req.method === 'POST') {
    if (req.query.seed !== undefined) {
      await handleSeed(req, res);
    } else if (req.query.confirm !== undefined) {
      await handleConfirm(req, res);
    } else if (req.query.reject !== undefined) {
      await handleReject(req, res);
    } else {
      await handleGenerate(req, res);
    }
    return;
  }

  if (req.method === 'PATCH') {
    await handleUpdate(req, res);
    return;
  }

  if (req.method === 'GET') {
    if (req.query.export !== undefined) {
      await handleExportGroup(req, res);
    } else {
      await handleList(req, res);
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed. Use GET, POST, or PATCH.' });
}
