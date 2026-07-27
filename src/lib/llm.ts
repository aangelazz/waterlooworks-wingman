import { getApiKey, getProvider } from './storage';
import type { Provider } from './types';

export class MissingKeyError extends Error {
  constructor() {
    super('No API key set. Add a free Gemini or Groq key in Settings.');
    this.name = 'MissingKeyError';
  }
}

export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
  }
}

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * Provider-agnostic "give me JSON" chokepoint. Gemini enforces the schema via
 * responseSchema; Groq gets the schema embedded in the system prompt with
 * response_format json_object. All fence-stripping / parse-retry hardening
 * lives here so callers just get a typed value or a thrown error.
 *
 * Note: schemas should have an OBJECT root (e.g. `{ items: [...] }`) because
 * Groq's json_object mode requires a JSON object, not a bare array.
 */
export async function chatJSON<T>(
  system: string,
  user: string,
  schema: object,
): Promise<T> {
  const key = getApiKey();
  if (!key) throw new MissingKeyError();
  const provider = getProvider();

  let text = await callProvider(provider, key, system, user, schema);
  try {
    return parseJsonLoose<T>(text);
  } catch {
    // One retry with an explicit nudge — cheap insurance against chatty output.
    text = await callProvider(
      provider,
      key,
      system,
      user + '\n\nReturn ONLY valid JSON matching the schema. No prose.',
      schema,
    );
    return parseJsonLoose<T>(text);
  }
}

async function callProvider(
  provider: Provider,
  key: string,
  system: string,
  user: string,
  schema: object,
): Promise<string> {
  return provider === 'gemini'
    ? callGemini(key, system, user, schema)
    : callGroq(key, system, user, schema);
}

async function callGemini(
  key: string,
  system: string,
  user: string,
  schema: object,
): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.2,
    },
  };
  const data = await postWithRetry(GEMINI_URL, {
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const text: unknown =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  if (typeof text !== 'string') {
    throw new LLMError('Gemini returned an empty response.');
  }
  return text;
}

async function callGroq(
  key: string,
  system: string,
  user: string,
  schema: object,
): Promise<string> {
  const body = {
    model: GROQ_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          system +
          '\n\nRespond with a single JSON object that matches this JSON schema exactly:\n' +
          JSON.stringify(schema),
      },
      { role: 'user', content: user },
    ],
  };
  const data = await postWithRetry(GROQ_URL, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const text: unknown = data?.choices?.[0]?.message?.content ?? null;
  if (typeof text !== 'string') {
    throw new LLMError('Groq returned an empty response.');
  }
  return text;
}

const FETCH_TIMEOUT_MS = 60_000;

/** POST with a single retry+backoff on 429/5xx (free tiers rate-limit hard). */
async function postWithRetry(
  url: string,
  init: { headers: Record<string, string>; body: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      // Timeout guards against hung connections that never error out —
      // without it the UI stays stuck on "Parsing…"/"Ranking…" forever.
      res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        ...init,
      });
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === 'TimeoutError' || e.name === 'AbortError')
      ) {
        throw new LLMError(
          'Request timed out after 60 seconds — check your connection and try again.',
        );
      }
      throw e;
    }
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt === 0) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    let detail = '';
    try {
      const err = await res.json();
      detail = err?.error?.message ?? JSON.stringify(err).slice(0, 200);
    } catch {
      detail = res.statusText;
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new LLMError(
        `Provider rejected the request (${res.status}). Check your API key in Settings. ${detail}`,
      );
    }
    throw new LLMError(`LLM request failed (${res.status}): ${detail}`);
  }
}

/** Strip markdown fences and salvage the JSON payload from a model reply. */
export function parseJsonLoose<T>(text: string): T {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(t) as T;
  } catch {
    const start = Math.min(
      ...['{', '['].map((c) => {
        const i = t.indexOf(c);
        return i === -1 ? Infinity : i;
      }),
    );
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start !== Infinity && end > start) {
      return JSON.parse(t.slice(start, end + 1)) as T;
    }
    throw new LLMError('Model did not return parseable JSON.');
  }
}
