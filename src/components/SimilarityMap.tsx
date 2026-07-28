import { useEffect, useState } from 'react';
import { embed, embedPostings, simScoresFor } from '../lib/embeddings';
import { kmeans, pca2d, pickK } from '../lib/cluster';
import type { AgentAnalysis, Posting, Preferences, Tier } from '../lib/types';

// Muted-for-dark cluster palette: separable hues, low saturation.
const CLUSTER_COLORS = ['#8f9bd4', '#7fbf9b', '#d29a6a', '#c489a6', '#7fb0c9', '#a68fce'];
const TIER_RING: Record<Tier, string> = {
  S: '#e0aa4f',
  A: '#7fbf9b',
  B: '#7fb0c9',
  C: '#57534e',
};

// viewBox aspect used for both the SVG and the wrapper, so the percent-based
// tooltip positioning lines up with the rendered points.
const VW = 100;
const VH = 62;

interface Point {
  postingId: string;
  x: number; // viewBox coords
  y: number;
  cluster: number;
}

export default function SimilarityMap({
  postings,
  analyses,
  preferences,
  onSimScores,
}: {
  postings: Posting[];
  analyses: AgentAnalysis[];
  preferences: Preferences;
  onSimScores: (scores: Map<string, number>) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [k, setK] = useState(1);
  const [hover, setHover] = useState<Point | null>(null);

  const prefText = preferences.freeText.trim();

  useEffect(() => {
    if (postings.length === 0) {
      setStatus('idle');
      setPoints([]);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setError(null);
    setHover(null);

    (async () => {
      // Truncate raw text — MiniLM only attends to ~256 tokens anyway.
      // Posting vectors go through the module-level cache, so tab revisits
      // and preference reblends only embed what changed.
      const postingVecs = await embedPostings(
        postings.map((p) => ({ id: p.id, text: p.raw.slice(0, 1200) })),
        setProgress,
      );
      if (cancelled) return;

      if (prefText) {
        const [prefVec] = await embed([prefText], setProgress);
        if (cancelled) return;
        onSimScores(
          simScoresFor(prefVec, postingVecs, postings.map((p) => p.id)),
        );
      }

      const coords = pca2d(postingVecs);
      const kk = pickK(postings.length);
      const labels = kmeans(postingVecs, kk);
      setK(kk);

      // Scale PCA coords into the viewBox with padding.
      const xs = coords.map((c) => c.x);
      const ys = coords.map((c) => c.y);
      const pad = 8;
      const sx = scaler(Math.min(...xs), Math.max(...xs), pad, VW - pad);
      const sy = scaler(Math.min(...ys), Math.max(...ys), pad, VH - pad);
      setPoints(
        postings.map((p, i) => ({
          postingId: p.id,
          x: sx(coords[i].x),
          y: sy(coords[i].y),
          cluster: labels[i],
        })),
      );
      setStatus('ready');
    })().catch((e: unknown) => {
      if (cancelled) return;
      setStatus('error');
      setError(
        e instanceof Error
          ? e.message
          : 'Embedding model failed to load. The rest of the app still works.',
      );
    });

    return () => {
      cancelled = true;
    };
    // onSimScores is a stable useCallback from App.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postings, prefText]);

  if (postings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge-strong bg-surface p-10 text-center text-ink-mid">
        <p className="font-display text-lg text-ink">Nothing to map yet</p>
        <p className="mt-1.5 text-sm">
          Load postings first (paste or demo data) — then this tab embeds every posting with an
          on-device transformer and lays out the whole job landscape.
        </p>
      </div>
    );
  }

  const analysisById = new Map(analyses.map((a) => [a.postingId, a]));
  const postingById = new Map(postings.map((p) => [p.id, p]));
  const hoverPosting = hover ? postingById.get(hover.postingId) : null;
  const hoverAnalysis = hover ? analysisById.get(hover.postingId) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
        <span>
          MiniLM embeddings running <span className="font-medium text-ink-mid">in this tab</span>{' '}
          (WebGPU, WASM fallback) → PCA → k-means. Nothing leaves your browser.
        </span>
        {status === 'ready' && analyses.length > 0 && (
          <span className="flex items-center gap-2">
            {(['S', 'A', 'B', 'C'] as const).map((t) => (
              <span key={t} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border-2 bg-surface"
                  style={{ borderColor: TIER_RING[t] }}
                />
                {t}
              </span>
            ))}
            <span className="text-ink-faint">tier rings</span>
          </span>
        )}
      </div>

      {status === 'loading' && (
        <div className="rounded-lg border border-edge bg-surface p-6">
          <p className="mb-2 text-sm text-ink-mid">
            Downloading the embedding model (~25 MB, one-time — cached after)…
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-edge">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs tabular-nums text-ink-faint">{progress}%</p>
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {status === 'ready' && (
        <div
          className="relative w-full overflow-hidden rounded-lg border border-edge bg-bg"
          style={{ aspectRatio: `${VW} / ${VH}` }}
        >
          <svg viewBox={`0 0 ${VW} ${VH}`} className="h-full w-full">
            {/* Subtle grid so the plot reads as a map, not a void. */}
            {[20, 40, 60, 80].map((gx) => (
              <line
                key={`gx${gx}`}
                x1={gx}
                y1={0}
                x2={gx}
                y2={VH}
                stroke="#292420"
                strokeWidth={0.15}
              />
            ))}
            {[20, 40].map((gy) => (
              <line
                key={`gy${gy}`}
                x1={0}
                y1={gy}
                x2={VW}
                y2={gy}
                stroke="#292420"
                strokeWidth={0.15}
              />
            ))}
            {points.map((pt) => {
              const analysis = analysisById.get(pt.postingId);
              const ring = analysis ? TIER_RING[analysis.tier] : '#3a332c';
              const isHover = hover?.postingId === pt.postingId;
              return (
                <circle
                  key={pt.postingId}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHover ? 2.4 : analysis?.tier === 'S' ? 2.1 : 1.7}
                  fill={CLUSTER_COLORS[pt.cluster % CLUSTER_COLORS.length]}
                  fillOpacity={0.85}
                  stroke={ring}
                  strokeWidth={analysis?.tier === 'S' ? 0.7 : 0.45}
                  onMouseEnter={() => setHover(pt)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-pointer"
                />
              );
            })}
          </svg>
          {hover && hoverPosting && (
            <div
              className="pointer-events-none absolute z-10 max-w-56 -translate-x-1/2 rounded-md border border-edge-strong bg-surface px-3 py-2 text-xs text-ink"
              style={{
                left: `${(hover.x / VW) * 100}%`,
                top: `${(hover.y / VH) * 100}%`,
                transform: `translate(-50%, ${hover.y > VH / 2 ? 'calc(-100% - 10px)' : '10px'})`,
              }}
            >
              <p className="font-semibold">{hoverPosting.title}</p>
              <p className="text-ink-mid">{hoverPosting.organization}</p>
              {hoverAnalysis && (
                <p className="mt-0.5 text-ink-mid">
                  Tier {hoverAnalysis.tier} · final {hoverAnalysis.finalScore}/100
                </p>
              )}
            </div>
          )}
          <p className="absolute bottom-2 left-3 text-[10px] text-ink-faint">
            {points.length} postings · {k} semantic cluster{k === 1 ? '' : 's'} · similar jobs
            sit closer together
          </p>
        </div>
      )}
    </div>
  );
}

function scaler(min: number, max: number, outMin: number, outMax: number) {
  const range = max - min;
  if (range < 1e-9) return () => (outMin + outMax) / 2;
  return (v: number) => outMin + ((v - min) / range) * (outMax - outMin);
}
