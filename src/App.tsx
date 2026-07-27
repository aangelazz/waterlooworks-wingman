import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PasteImport from './components/PasteImport';
import PreferencesBar from './components/PreferencesBar';
import SettingsModal from './components/SettingsModal';
import SimilarityMap from './components/SimilarityMap';
import TierList from './components/TierList';
import Tracker from './components/Tracker';
import { analyze, PartialAnalysisError, reblend } from './lib/agent';
import { demoApplications, demoPostings, demoTermStat } from './lib/demoData';
import { hasApiKey, loadState, saveState } from './lib/storage';
import type {
  AgentAnalysis,
  Application,
  Posting,
  TermStat,
} from './lib/types';

type Tab = 'tracker' | 'shortlist' | 'map';

const saved = loadState();

const TABS: { id: Tab; label: string }[] = [
  { id: 'tracker', label: 'Tracker' },
  { id: 'shortlist', label: 'Shortlist' },
  { id: 'map', label: 'Map' },
];

export default function App() {
  const [postings, setPostings] = useState<Posting[]>(saved?.postings ?? []);
  const [applications, setApplications] = useState<Application[]>(
    saved?.applications ?? [],
  );
  const [analyses, setAnalyses] = useState<AgentAnalysis[]>(
    saved?.analyses ?? [],
  );
  const [prefText, setPrefText] = useState(saved?.preferences.freeText ?? '');
  const [termStat, setTermStat] = useState<TermStat | null>(
    saved?.termStat ?? null,
  );
  const [tab, setTab] = useState<Tab>('tracker');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyTick, setKeyTick] = useState(0);
  const [ranking, setRanking] = useState(false);
  // A ref (not state) so handleRank always reads the freshest scores — a
  // state value captured at click time goes stale if embeddings finish while
  // the analyze call is in flight.
  const simScoresRef = useRef<Map<string, number> | null>(null);

  // keyTick invalidates the memo whenever the settings modal saves/clears.
  const keyed = useMemo(() => hasApiKey(), [keyTick]);

  // Stretch #7: persist parsed data + preferences across reloads.
  useEffect(() => {
    saveState({
      postings,
      applications,
      analyses,
      preferences: { freeText: prefText },
      termStat,
    });
  }, [postings, applications, analyses, prefText, termStat]);

  const loadDemo = useCallback(() => {
    setPostings(demoPostings);
    setApplications(demoApplications);
    setTermStat(demoTermStat);
    setAnalyses([]);
    simScoresRef.current = null;
  }, []);

  const addPostings = useCallback((incoming: Posting[]) => {
    setPostings((prev) => mergeById(prev, incoming));
    setAnalyses([]);
    simScoresRef.current = null;
  }, []);

  const addApplications = useCallback(
    (incoming: Application[], stat: TermStat | null) => {
      setApplications((prev) => mergeById(prev, incoming));
      if (stat) setTermStat(stat);
    },
    [],
  );

  const handleRank = useCallback(async () => {
    setRanking(true);
    try {
      const result = await analyze(
        postings,
        { freeText: prefText },
        simScoresRef.current,
      );
      // Re-read the ref after the await: embeddings may have finished while
      // the LLM call was in flight.
      const sims = simScoresRef.current;
      setAnalyses(sims ? reblend(result, sims) : result);
      setTab('shortlist');
    } catch (e) {
      if (e instanceof PartialAnalysisError) {
        // Keep the batches that completed; the error still surfaces below.
        const sims = simScoresRef.current;
        setAnalyses(sims ? reblend(e.analyses, sims) : e.analyses);
        setTab('shortlist');
      }
      throw e;
    } finally {
      setRanking(false);
    }
  }, [postings, prefText]);

  const handleSimScores = useCallback((scores: Map<string, number>) => {
    simScoresRef.current = scores;
    setAnalyses((prev) => (prev.length > 0 ? reblend(prev, scores) : prev));
  }, []);

  const clearAll = useCallback(() => {
    setPostings([]);
    setApplications([]);
    setAnalyses([]);
    setTermStat(null);
    simScoresRef.current = null;
  }, []);

  const hasData = postings.length > 0 || applications.length > 0;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              WaterlooWorks Wingman <span aria-hidden>🪿</span>
            </h1>
            <p className="text-xs text-slate-500">
              Privacy-first co-op copilot — paste your postings, track, rank, and map your odds.
              Nothing leaves your browser.
            </p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            aria-label="Open settings"
          >
            ⚙️ Settings
          </button>
        </div>
      </header>

      {!keyed && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2.5 text-sm text-amber-800">
            <span>
              <span className="font-medium">No API key set.</span> Demo data, the tracker and
              competition odds work without one — parsing your own pastes and AI ranking need a
              free Gemini or Groq key.
            </span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600"
            >
              Add key
            </button>
          </div>
        </div>
      )}

      <nav className="mx-auto mt-4 max-w-5xl px-4">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
              {t.id === 'tracker' && applications.length > 0 && (
                <span className="ml-1.5 text-xs opacity-70">{applications.length}</span>
              )}
              {t.id === 'shortlist' && postings.length > 0 && (
                <span className="ml-1.5 text-xs opacity-70">{postings.length}</span>
              )}
            </button>
          ))}
          {hasData && (
            <button
              onClick={clearAll}
              className="ml-auto rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Remove all parsed data from this browser"
            >
              Clear data
            </button>
          )}
        </div>
      </nav>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        {tab === 'tracker' && <Tracker applications={applications} termStat={termStat} />}

        {tab === 'shortlist' && (
          <>
            <PreferencesBar
              value={prefText}
              onChange={setPrefText}
              onRank={handleRank}
              canRank={postings.length > 0}
              ranking={ranking}
            />
            <TierList postings={postings} analyses={analyses} />
          </>
        )}

        {tab === 'map' && (
          <SimilarityMap
            postings={postings}
            analyses={analyses}
            preferences={{ freeText: prefText }}
            onSimScores={handleSimScores}
          />
        )}

        {tab !== 'map' && (
          <PasteImport
            onPostings={addPostings}
            onApplications={addApplications}
            onLoadDemo={loadDemo}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 pt-2 text-center text-xs text-slate-400">
        <p>
          All data stays in your browser (localStorage only). Your API key is sent solely to the
          LLM provider you picked. Embeddings run on-device via transformers.js. No backend, no
          tracking, no scraping.
        </p>
      </footer>

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setKeyTick((n) => n + 1)}
        />
      )}
    </div>
  );
}

function mergeById<T extends { id: string }>(prev: T[], incoming: T[]): T[] {
  // Dedupe within the incoming batch too, so re-pasting the same content
  // (or a paste with a repeated row) never creates duplicate rows.
  const ids = new Set<string>();
  const merged: T[] = [];
  for (const item of incoming) {
    if (ids.has(item.id)) continue;
    ids.add(item.id);
    merged.push(item);
  }
  for (const item of prev) {
    if (!ids.has(item.id)) merged.push(item);
  }
  return merged;
}
