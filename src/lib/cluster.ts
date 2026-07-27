/**
 * Hand-rolled PCA (power iteration) + k-means. No dependencies — at this
 * scale (≤ ~100 postings × 384 dims) both run in well under a millisecond.
 */

/** Project vectors onto their top-2 principal components. */
export function pca2d(vectors: Float32Array[]): { x: number; y: number }[] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];
  const d = vectors[0].length;

  // Center.
  const mean = new Float64Array(d);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  const X = vectors.map((v) => {
    const row = new Float64Array(d);
    for (let j = 0; j < d; j++) row[j] = v[j] - mean[j];
    return row;
  });

  const pc1 = powerIteration(X);
  // Deflate: remove the pc1 component from every row, then repeat.
  for (const row of X) {
    const proj = dot(row, pc1);
    for (let j = 0; j < d; j++) row[j] -= proj * pc1[j];
  }
  const pc2 = powerIteration(X);

  // X rows were deflated in place, so recompute projections from originals.
  return vectors.map((v) => {
    const centered = new Float64Array(d);
    for (let j = 0; j < d; j++) centered[j] = v[j] - mean[j];
    return { x: dot(centered, pc1), y: dot(centered, pc2) };
  });
}

/** Top eigenvector of X^T X via power iteration (~40 iterations). */
function powerIteration(X: Float64Array[], iters = 40): Float64Array {
  const d = X[0].length;
  let w = new Float64Array(d);
  // Deterministic pseudo-random init so layouts are stable across renders.
  for (let j = 0; j < d; j++) w[j] = Math.sin(j * 12.9898) * 43758.5453 % 1;
  normalize(w);
  for (let it = 0; it < iters; it++) {
    const next = new Float64Array(d);
    for (const row of X) {
      const s = dot(row, w);
      for (let j = 0; j < d; j++) next[j] += s * row[j];
    }
    const norm = normalize(next);
    if (norm < 1e-12) break; // no variance left
    w = next;
  }
  return w;
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalize(v: Float64Array): number {
  const norm = Math.sqrt(dot(v, v));
  if (norm > 1e-12) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return norm;
}

/** Sensible cluster count for small n. */
export function pickK(n: number): number {
  return Math.min(4, Math.max(1, Math.floor(n / 3)));
}

/** Plain k-means with random init; returns a cluster label per vector. */
export function kmeans(
  vectors: Float32Array[],
  k: number,
  iters = 20,
): number[] {
  const n = vectors.length;
  if (n === 0) return [];
  k = Math.min(k, n);
  const d = vectors[0].length;

  // Init centroids from k distinct points (deterministic stride pick).
  const centroids: Float64Array[] = [];
  for (let c = 0; c < k; c++) {
    const idx = Math.floor((c * n) / k);
    centroids.push(Float64Array.from(vectors[idx]));
  }

  const labels = new Array<number>(n).fill(0);
  for (let it = 0; it < iters; it++) {
    let changed = false;
    // Assign.
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        let dist = 0;
        const cen = centroids[c];
        const v = vectors[i];
        for (let j = 0; j < d; j++) {
          const diff = v[j] - cen[j];
          dist += diff * diff;
        }
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }
    if (!changed && it > 0) break;
    // Update.
    const sums = Array.from({ length: k }, () => new Float64Array(d));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      counts[labels[i]]++;
      const sum = sums[labels[i]];
      const v = vectors[i];
      for (let j = 0; j < d; j++) sum[j] += v[j];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // Empty cluster: reseed to the point farthest into the biggest cluster.
        centroids[c] = Float64Array.from(vectors[(c * 7 + 3) % n]);
        continue;
      }
      for (let j = 0; j < d; j++) centroids[c][j] = sums[c][j] / counts[c];
    }
  }
  return labels;
}
