import type { FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let ready = false;

/** True once the model is downloaded + initialized (no await needed). */
export function embeddingsReady(): boolean {
  return ready;
}

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
    extractorPromise = import('@huggingface/transformers').then(
      ({ pipeline }) => {
        const opts = { dtype: 'q8', progress_callback: cb } as const;
        return pipeline('feature-extraction', MODEL, {
          ...opts,
          device: 'webgpu',
        })
          .catch(() =>
            pipeline('feature-extraction', MODEL, { ...opts, device: 'wasm' }),
          )
          .then((p) => {
            ready = true;
            onProgress?.(100);
            return p;
          });
      },
    );
  }
  return extractorPromise;
}

/** Embed texts → one normalized Float32Array[384] per text. */
export async function embed(
  texts: string[],
  onProgress?: (pct: number) => void,
): Promise<Float32Array[]> {
  const extractor = await getExtractor(onProgress);
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  const data = output.data as Float32Array;
  const dims = output.dims;
  const d = dims[dims.length - 1];
  return texts.map((_, i) => data.slice(i * d, (i + 1) * d));
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
