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
    <div className="rounded-lg border border-edge bg-surface p-4">
      <label htmlFor="prefs" className="mb-1.5 block text-sm font-medium text-ink">
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
          className="flex-1 rounded-md border border-edge-strong bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
        <button
          onClick={() => void handleRank()}
          disabled={!canRank || ranking}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ranking ? 'Ranking…' : 'Rank my jobs'}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        Blended score: 55% LLM fit + 25% competition odds + 20% semantic similarity (odds are
        computed deterministically — the AI can’t fudge them).
      </p>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
