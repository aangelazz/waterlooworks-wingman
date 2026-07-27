import type { FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

interface ProgressEvent {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

/**
 * Lazy singleton extractor. ~25 MB quantized model downloads only on first
 * call (i.e. when the Map tab is opened) and is cached by the browser after.
 * Tries WebGPU first; if the device is unavailable (Safari, older Chrome),
 * falls back to WASM — plenty fast for ≤50 postings × 384 dims.
 */
export function getExtractor(
  onProgress?: (pct: number) => void,
): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    const files = new Map<string, { loaded: number; total: number }>();
    const cb = (e: ProgressEvent) => {
      if (e.status === 'progress' && e.file && onProgress) {
        files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        if (total > 0) onProgress(Math.min(99, Math.round((100 * loaded) / total)));
      }
    };
    // Dynamic import keeps transformers.js (~1 MB of JS) out of the main
    // bundle — it only loads when the Map tab is first opened.
    extractorPromise = import('@huggingface/transformers')
      .then(({ pipeline }) => {
        const opts = { dtype: 'q8', progress_callback: cb } as const;
        return pipeline('feature-extraction', MODEL, {
          ...opts,
          device: 'webgpu',
        })
          .catch(() =>
            pipeline('feature-extraction', MODEL, { ...opts, device: 'wasm' }),
          )
          .then((p) => {
            onProgress?.(100);
            return p;
          });
      })
      .catch((e: unknown) => {
        // Never cache a rejected promise — a failed download would otherwise
        // make every future call re-throw the stale error until a full page
        // reload. Resetting lets re-opening the Map tab genuinely retry.
        extractorPromise = null;
        throw e;
      });
  }
  return extractorPromise;
}

const EMBED_BATCH = 12;

/**
 * Embed texts → one normalized Float32Array[384] per text. Runs in
 * mini-batches with a yield between them: one big forward pass over 100+
 * postings on the WASM fallback means hundreds of MB of transient attention
 * buffers and a multi-second main-thread freeze.
 */
export async function embed(
  texts: string[],
  onProgress?: (pct: number) => void,
): Promise<Float32Array[]> {
  const extractor = await getExtractor(onProgress);
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const output = await extractor(batch, { pooling: 'mean', normalize: true });
    const data = output.data as Float32Array;
    const dims = output.dims;
    const d = dims[dims.length - 1];
    for (let j = 0; j < batch.length; j++) {
      out.push(data.slice(j * d, (j + 1) * d));
    }
    // Yield to the event loop between batches so the UI can paint.
    if (i + EMBED_BATCH < texts.length) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return out;
}

// Module-level vector cache keyed by posting id + text, so Map tab revisits
// and preference reblends reuse vectors instead of redoing the forward pass.
const vectorCache = new Map<string, Float32Array>();

/** Embed postings through the cache; only misses hit the model. */
export async function embedPostings(
  items: { id: string; text: string }[],
  onProgress?: (pct: number) => void,
): Promise<Float32Array[]> {
  const keys = items.map((it) => `${it.id}\u0000${it.text}`);
  const missing: number[] = [];
  keys.forEach((k, i) => {
    if (!vectorCache.has(k)) missing.push(i);
  });
  if (missing.length > 0) {
    const vectors = await embed(
      missing.map((i) => items[i].text),
      onProgress,
    );
    missing.forEach((i, j) => vectorCache.set(keys[i], vectors[j]));
  }
  return keys.map((k) => vectorCache.get(k)!);
}

/** Vectors are normalized, so cosine similarity is just the dot product. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * simScore per posting: cosine(prefVector, postingVector), min–max normalized
 * across the batch to 0–100. Raw MiniLM cosines cluster in a narrow band
 * (~0.1–0.6), so relative normalization gives the blend a usable spread.
 */
export function simScoresFor(
  prefVector: Float32Array,
  postingVectors: Float32Array[],
  postingIds: string[],
): Map<string, number> {
  const sims = postingVectors.map((v) => cosine(prefVector, v));
  const min = Math.min(...sims);
  const max = Math.max(...sims);
  const range = max - min;
  const scores = new Map<string, number>();
  postingIds.forEach((id, i) => {
    const score = range < 1e-6 ? 50 : Math.round(((sims[i] - min) / range) * 100);
    scores.set(id, score);
  });
  return scores;
}
