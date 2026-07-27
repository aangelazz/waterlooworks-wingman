import { useState } from 'react';

export default function PreferencesBar({
  value,
  onChange,
  onRank,
  canRank,
  ranking,
}: {
  value: string;
  onChange: (v: string) => void;
  onRank: () => Promise<void>;
  canRank: boolean;
  ranking: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  const handleRank = async () => {
    setError(null);
    try {
      await onRank();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ranking failed. Try again.');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label htmlFor="prefs" className="mb-1 block text-sm font-medium text-slate-700">
        Your preferences
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="prefs"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canRank && !ranking) void handleRank();
          }}
          placeholder='e.g. "remote or Toronto, React/TypeScript, small product teams, $30+/hr"'
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
        <button
          onClick={() => void handleRank()}
          disabled={!canRank || ranking}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ranking ? 'Ranking…' : 'Rank my jobs'}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-slate-400">
        Blended score: 55% LLM fit + 25% competition odds + 20% semantic similarity (odds are
        computed deterministically — the AI can’t fudge them).
      </p>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
