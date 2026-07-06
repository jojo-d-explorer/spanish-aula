import { getSupabaseClient } from './client.js';
import type { Settings } from '../settings/types';
import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';

export async function getSettings(): Promise<Settings> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('settings')
    .select('dialect, dele_level')
    .eq('id', true)
    .single();

  if (error || !data) throw error ?? new Error('Settings row not found.');

  return { dialect: data.dialect as DialectCode, deleLevel: data.dele_level as DeleLevel };
}

export async function updateDeleLevel(deleLevel: DeleLevel): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('settings')
    .update({ dele_level: deleLevel, updated_at: new Date().toISOString() })
    .eq('id', true);

  if (error) throw error;
}

export async function getRecentDeleLevelEstimates(limit: number): Promise<string[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('entries')
    .select('dele_level_estimate')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => row.dele_level_estimate as string);
}
