import type { DialectCode, DeleLevel } from '../prompts/writingPrompt';

export interface Settings {
  dialect: DialectCode;
  deleLevel: DeleLevel;
}

export interface LevelNudge {
  suggestedLevel: DeleLevel;
  reason: string;
}

export interface SettingsResponse extends Settings {
  nudge: LevelNudge | null;
}
