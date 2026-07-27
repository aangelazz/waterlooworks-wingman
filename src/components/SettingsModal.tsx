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
      setCheckResult({ ok: true, message: '✓ Key verified — you’re set.' });
      setTimeout(onClose, 900);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      // A 429 means the key itself is valid; the provider is just out of
      // free-tier quota right now. Don't frame that as a broken key.
      if (msg.includes('429')) {
        setCheckResult({
          ok: true,
          message:
            '✓ Key works, but its free-tier quota is used up right now. Quota resets daily, or create a fresh key in a new project.',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Settings — bring your own key</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700">LLM provider</label>
        <div className="mb-4 flex gap-2">
          {(['gemini', 'groq'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProviderState(p)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                provider === p
                  ? 'border-amber-400 bg-amber-50 text-amber-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p === 'gemini' ? 'Google Gemini (recommended)' : 'Groq (Llama 3.3)'}
            </button>
          ))}
        </div>

        <label htmlFor="apikey" className="mb-1 block text-sm font-medium text-slate-700">
          API key
        </label>
        <input
          id="apikey"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={provider === 'gemini' ? 'AIza…' : 'gsk_…'}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <p className="mt-2 text-xs text-slate-500">
          Free keys:{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-amber-700 underline"
          >
            aistudio.google.com/apikey
          </a>{' '}
          (Gemini) ·{' '}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            className="text-amber-700 underline"
          >
            console.groq.com/keys
          </a>{' '}
          (Groq)
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Your key is stored only in this browser’s localStorage and sent only to the provider
          you chose. There is no backend.
        </p>

        {checkResult && (
          <p
            className={`mt-3 text-sm ${
              checkResult.ok ? 'text-emerald-600' : 'text-rose-600'
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
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
          >
            Clear key
          </button>
          <button
            onClick={() => void save()}
            disabled={checking}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? 'Checking key…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
