import { useState } from 'react';
import { extractApplications, extractPostings, extractTermStat } from '../lib/parse';
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
      if (e instanceof MissingKeyError) {
        setError('Parsing needs an LLM. Add a free Gemini or Groq key in Settings — or load the demo data.');
      } else {
        setError(e instanceof Error ? e.message : 'Parsing failed.');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Import your data</h2>
        <span className="text-xs text-slate-400">
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
        className="w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void run('postings')}
          disabled={busy !== null}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'postings' ? 'Parsing…' : 'Parse as postings'}
        </button>
        <button
          onClick={() => void run('applications')}
          disabled={busy !== null}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'applications' ? 'Parsing…' : 'Parse as My Applications'}
        </button>
        <span className="text-xs text-slate-400">or</span>
        <button
          onClick={onLoadDemo}
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
        >
          Load demo data
        </button>
      </div>
      {message && <p className="mt-2 text-sm text-emerald-600">{message}</p>}
      {error && (
        <p className="mt-2 text-sm text-rose-600">
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
