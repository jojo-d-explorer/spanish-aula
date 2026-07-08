import { getSupabaseClient } from './client.js';
import type { ErrorCategory } from '../grading/types';
import type { DeleLevel } from '../prompts/writingPrompt';
import type { LessonRole, LessonMessage, LessonLogEntry, LessonThread } from '../lessons/types';

interface LessonMessageRow {
  id: string;
  lesson_id: string;
  role: string;
  content: string;
  created_at: string;
}

function mapMessageRow(row: LessonMessageRow): LessonMessage {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    role: row.role as LessonRole,
    content: row.content,
    createdAt: row.created_at,
  };
}

interface LessonLogRow {
  id: string;
  topic_category: string | null;
  topic_freeform: string | null;
  dele_level_at_creation: string;
  created_at: string;
}

function mapLogRow(row: LessonLogRow): LessonLogEntry {
  return {
    id: row.id,
    topicCategory: row.topic_category as ErrorCategory | null,
    topicFreeform: row.topic_freeform,
    deleLevelAtCreation: row.dele_level_at_creation as DeleLevel,
    createdAt: row.created_at,
  };
}

export interface CreateLessonThreadInput {
  topicCategory: ErrorCategory | null;
  topicFreeform: string | null;
  deleLevelAtCreation: DeleLevel;
  openingUserMessage: string;
  openingAssistantMessage: string;
}

export async function createLessonThread(
  input: CreateLessonThreadInput,
): Promise<{ lessonId: string; messages: LessonMessage[] }> {
  const supabase = getSupabaseClient();

  const { data: log, error: logError } = await supabase
    .from('lesson_log')
    .insert({
      topic_category: input.topicCategory,
      topic_freeform: input.topicFreeform,
      dele_level_at_creation: input.deleLevelAtCreation,
    })
    .select('id')
    .single();

  if (logError || !log) {
    throw logError ?? new Error('Insert returned no lesson_log row.');
  }

  const { data: messages, error: messagesError } = await supabase
    .from('lesson_messages')
    .insert([
      { lesson_id: log.id, role: 'user', content: input.openingUserMessage },
      { lesson_id: log.id, role: 'assistant', content: input.openingAssistantMessage },
    ])
    .select();

  if (messagesError || !messages) {
    // Don't leave an orphaned lesson_log row with no messages behind.
    await supabase.from('lesson_log').delete().eq('id', log.id);
    throw messagesError ?? new Error('Insert returned no lesson_messages rows.');
  }

  return {
    lessonId: log.id as string,
    messages: (messages as LessonMessageRow[]).map(mapMessageRow),
  };
}

export async function appendLessonMessage(input: {
  lessonId: string;
  role: LessonRole;
  content: string;
}): Promise<LessonMessage> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('lesson_messages')
    .insert({ lesson_id: input.lessonId, role: input.role, content: input.content })
    .select()
    .single();

  if (error || !data) {
    throw error ?? new Error('Insert returned no lesson_messages row.');
  }

  return mapMessageRow(data as LessonMessageRow);
}

export async function fetchLessonLog(): Promise<LessonLogEntry[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('lesson_log')
    .select('id, topic_category, topic_freeform, dele_level_at_creation, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data as LessonLogRow[]).map(mapLogRow);
}

export async function fetchLessonThread(lessonId: string): Promise<LessonThread | null> {
  const supabase = getSupabaseClient();

  const [logResult, messagesResult] = await Promise.all([
    supabase
      .from('lesson_log')
      .select('id, topic_category, topic_freeform, dele_level_at_creation, created_at')
      .eq('id', lessonId)
      .single(),
    supabase
      .from('lesson_messages')
      .select('id, lesson_id, role, content, created_at')
      .eq('lesson_id', lessonId)
      .order('created_at', { ascending: true }),
  ]);

  const { data: logRow, error: logError } = logResult;
  if (logError || !logRow) return null;

  const { data: messageRows, error: messagesError } = messagesResult;
  if (messagesError) throw messagesError;

  return {
    ...mapLogRow(logRow as LessonLogRow),
    messages: ((messageRows ?? []) as LessonMessageRow[]).map(mapMessageRow),
  };
}
