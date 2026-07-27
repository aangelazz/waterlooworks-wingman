import type {
  AgentAnalysis,
  Application,
  Posting,
  Preferences,
  Provider,
  TermStat,
} from './types';

const KEY_PROVIDER = 'wingman.provider';
const KEY_APIKEY = 'wingman.apiKey';
const KEY_STATE = 'wingman.state';

export function getProvider(): Provider {
  const v = localStorage.getItem(KEY_PROVIDER);
  return v === 'groq' ? 'groq' : 'gemini';
}

export function setProvider(p: Provider): void {
  localStorage.setItem(KEY_PROVIDER, p);
}

export function getApiKey(): string {
  return localStorage.getItem(KEY_APIKEY) ?? '';
}

export function setApiKey(key: string): void {
  if (key) localStorage.setItem(KEY_APIKEY, key);
  else localStorage.removeItem(KEY_APIKEY);
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

/** Persisted app state (stretch #7): parsed data + preferences + analyses. */
export interface SavedState {
  postings: Posting[];
  applications: Application[];
  analyses: AgentAnalysis[];
  preferences: Preferences;
  termStat: TermStat | null;
}

export function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(KEY_STATE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    return {
      postings: Array.isArray(parsed.postings) ? parsed.postings : [],
      applications: Array.isArray(parsed.applications)
        ? parsed.applications
        : [],
      analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
      preferences:
        parsed.preferences && typeof parsed.preferences.freeText === 'string'
          ? parsed.preferences
          : { freeText: '' },
      termStat:
        parsed.termStat && typeof parsed.termStat.submitted === 'number'
          ? parsed.termStat
          : null,
    };
  } catch {
    return null;
  }
}

export function saveState(state: SavedState): void {
  try {
    localStorage.setItem(KEY_STATE, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — persistence is best-effort.
  }
}

export function clearState(): void {
  localStorage.removeItem(KEY_STATE);
}
