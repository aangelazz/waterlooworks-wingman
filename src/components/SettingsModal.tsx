import { useState } from 'react';
import { chatJSON } from '../lib/llm';
import { getApiKey, getProvider, setApiKey, setProvider } from '../lib/storage';
import type { Provider } from '../lib/types';

export default function SettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [provider, setProviderState] = useState<Provider>(getProvider());
  const [key, setKey] = useState(getApiKey());
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const save = async () => {
    const trimmed = key.trim();
    setProvider(provider);
    setApiKey(trimmed);
    onSaved();
    if (!trimmed) {
      onClose();
      return;
    }
    // Validate the key with a tiny live call so a typo'd key is caught here
    // instead of on the first real (quota-burning) parse or rank.
    setChecking(true);
    setCheckResult(null);
    try {
      await chatJSON<{ ok: boolean }>(
        'You are a connectivity check. Respond with JSON only.',
        'Return exactly {"ok": true}',
        {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
      );
      setCheckResult({ ok: true, message: 'Key verified — you’re set.' });
      setTimeout(onClose, 900);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      // A 429 means the key itself is valid; the provider is just out of
      // free-tier quota right now. Don't frame that as a broken key.
      if (msg.includes('429')) {
        setCheckResult({
          ok: true,
          message:
            'Key works, but its free-tier quota is used up right now. Quota resets daily, or create a fresh key in a new project.',
        });
      } else {
        setCheckResult({
          ok: false,
          message: `Key saved, but the test call failed: ${msg}`,
        });
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-edge-strong bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">Settings — bring your own key</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md p-1.5 text-ink-faint transition hover:bg-surface-2 hover:text-ink"
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <label className="mb-1 block text-sm font-medium text-ink">LLM provider</label>
        <div className="mb-4 flex gap-2">
          {(['gemini', 'groq'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProviderState(p)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                provider === p
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-edge-strong text-ink-mid hover:bg-surface-2'
              }`}
            >
              {p === 'gemini' ? 'Google Gemini (recommended)' : 'Groq (Llama 3.3)'}
            </button>
          ))}
        </div>

        <label htmlFor="apikey" className="mb-1 block text-sm font-medium text-ink">
          API key
        </label>
        <input
          id="apikey"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={provider === 'gemini' ? 'AIza…' : 'gsk_…'}
          className="w-full rounded-md border border-edge-strong bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
        <p className="mt-2 text-xs text-ink-mid">
          Free keys:{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-hover"
          >
            aistudio.google.com/apikey
          </a>{' '}
          (Gemini) ·{' '}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-hover"
          >
            console.groq.com/keys
          </a>{' '}
          (Groq)
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          Your key is stored only in this browser’s localStorage and sent only to the provider
          you chose. There is no backend.
        </p>

        {checkResult && (
          <p
            className={`mt-3 text-sm ${
              checkResult.ok ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {checkResult.message}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => {
              setKey('');
              setApiKey('');
              setCheckResult(null);
              onSaved();
            }}
            className="rounded-md px-3 py-2 text-sm text-ink-mid transition hover:bg-surface-2 hover:text-ink"
          >
            Clear key
          </button>
          <button
            onClick={() => void save()}
            disabled={checking}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? 'Checking key…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
