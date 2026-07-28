import { useState } from 'react';
import {
  extractApplications,
  extractPostings,
  extractTermStat,
  PartialExtractionError,
} from '../lib/parse';
import { MissingKeyError } from '../lib/llm';
import type { Application, Posting, TermStat } from '../lib/types';

export default function PasteImport({
  onPostings,
  onApplications,
  onLoadDemo,
  onOpenSettings,
}: {
  onPostings: (p: Posting[]) => void;
  onApplications: (a: Application[], termStat: TermStat | null) => void;
  onLoadDemo: () => void;
  onOpenSettings: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'postings' | 'applications' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'postings' | 'applications') => {
    if (!text.trim()) {
      setError('Paste some WaterlooWorks text first (⌘A, ⌘C on the page works fine).');
      return;
    }
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      if (kind === 'postings') {
        const postings = await extractPostings(text);
        if (postings.length === 0) throw new Error('No postings found in that paste.');
        onPostings(postings);
        setMessage(`Parsed ${postings.length} posting${postings.length === 1 ? '' : 's'}.`);
      } else {
        const apps = await extractApplications(text);
        if (apps.length === 0) throw new Error('No application rows found in that paste.');
        onApplications(apps, extractTermStat(text));
        setMessage(`Parsed ${apps.length} application${apps.length === 1 ? '' : 's'}.`);
      }
      setText('');
    } catch (e) {
      if (e instanceof PartialExtractionError) {
        // Keep what parsed; leave the paste text so the user can retry the rest.
        onPostings(e.postings);
        setError(e.message);
      } else if (e instanceof MissingKeyError) {
        setError('Parsing needs an LLM. Add a free Gemini or Groq key in Settings — or load the demo data.');
      } else {
        setError(e instanceof Error ? e.message : 'Parsing failed.');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base text-ink">Import your data</h2>
        <span className="text-xs text-ink-faint">
          copy–paste straight from WaterlooWorks — messy formatting is fine
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={
          'Paste here: either a batch of job postings (detail pages or list view) or your "My Applications" table…'
        }
        className="w-full resize-y rounded-md border border-edge-strong bg-bg p-3 font-mono text-xs text-ink outline-none placeholder:text-ink-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void run('postings')}
          disabled={busy !== null}
          className="rounded-md border border-edge-strong bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'postings' ? 'Parsing…' : 'Parse as postings'}
        </button>
        <button
          onClick={() => void run('applications')}
          disabled={busy !== null}
          className="rounded-md border border-edge-strong bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'applications' ? 'Parsing…' : 'Parse as My Applications'}
        </button>
        <span className="text-xs text-ink-faint">or</span>
        <button
          onClick={onLoadDemo}
          className="rounded-md border border-accent/40 px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/10"
        >
          Load demo data
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-emerald-300">{message}</p>}
      {error && (
        <p className="mt-2 text-sm text-rose-300">
          {error}{' '}
          {error.includes('Settings') && (
            <button onClick={onOpenSettings} className="font-medium underline">
              Open Settings
            </button>
          )}
        </p>
      )}
    </div>
  );
}
