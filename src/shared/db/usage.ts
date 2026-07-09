import { getSupabaseClient } from './client.js';

export interface LogUsageInput {
  tab: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

// Pure internal telemetry — callers must always `await logUsage(...).catch(...)`
// (never let it throw into the handler's try/catch). A plain fire-and-forget
// `void logUsage(...)` is NOT safe here: on Vercel's serverless runtime the
// function can be frozen immediately after the response is sent, killing any
// still-pending unawaited promise before its insert completes. Awaiting the
// call (with its own internal .catch, so a logging failure can never surface
// to the user or block the response) is what actually guarantees the write
// finishes.
export async function logUsage(input: LogUsageInput): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('usage_log').insert({
    tab: input.tab,
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
  });

  if (error) throw error;
}
