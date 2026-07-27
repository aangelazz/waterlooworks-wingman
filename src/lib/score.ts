import type { Tier } from './types';

/**
 * Deterministic competition-odds score from applications/openings ratio.
 * 0–100 where higher = better odds. Log-scaled: ~2 apps per opening → ~100,
 * ~500 apps per opening → ~0. Missing data → neutral 50.
 */
export function oddsScore(
  applications: number | null | undefined,
  openings: number | null | undefined,
): number {
  if (applications == null || applications < 0) return 50;
  const opens = openings == null || openings <= 0 ? 1 : openings;
  const ratio = Math.max(applications / opens, 1);
  const LO = Math.log10(2); // ratio ≤ 2 → 100
  const HI = Math.log10(500); // ratio ≥ 500 → 0
  const t = (Math.log10(ratio) - LO) / (HI - LO);
  return Math.round(clamp01(1 - t) * 100);
}

export type OddsBand = 'good' | 'competitive' | 'longshot' | 'unknown';

export function oddsBand(
  score: number,
  applications: number | null | undefined,
): OddsBand {
  if (applications == null) return 'unknown';
  if (score >= 66) return 'good';
  if (score >= 33) return 'competitive';
  return 'longshot';
}

export const ODDS_BAND_META: Record<
  OddsBand,
  { emoji: string; label: string; className: string }
> = {
  good: {
    emoji: '🟢',
    label: 'good odds',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  competitive: {
    emoji: '🟡',
    label: 'competitive',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  longshot: {
    emoji: '🔴',
    label: 'long shot',
    className: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  unknown: {
    emoji: '⚪',
    label: 'no count data',
    className: 'bg-slate-100 text-slate-600 border-slate-300',
  },
};

/**
 * Blend fit/odds/sim into a final 0–100 score.
 * Weights: 0.55 fit, 0.25 odds, 0.20 sim. When simScore is null (embeddings
 * not loaded), the sim weight is redistributed proportionally to fit + odds.
 */
export function blendScores(
  fit: number,
  odds: number,
  sim: number | null,
): number {
  if (sim == null) {
    return Math.round((0.55 / 0.8) * fit + (0.25 / 0.8) * odds);
  }
  return Math.round(0.55 * fit + 0.25 * odds + 0.2 * sim);
}

/**
 * Assign tiers by rank quantile over finalScore: top 10% S, next 25% A,
 * next 40% B, rest C. Always at least one S. Deterministic — the LLM never
 * assigns tiers directly, so the distribution stays well-shaped.
 */
export function assignTiers(
  scored: { postingId: string; finalScore: number }[],
): Map<string, Tier> {
  const sorted = [...scored].sort((a, b) => b.finalScore - a.finalScore);
  const n = sorted.length;
  const tiers = new Map<string, Tier>();
  const sCut = Math.max(1, Math.round(n * 0.1));
  const aCut = sCut + Math.round(n * 0.25);
  const bCut = aCut + Math.round(n * 0.4);
  sorted.forEach((s, i) => {
    const tier: Tier = i < sCut ? 'S' : i < aCut ? 'A' : i < bCut ? 'B' : 'C';
    tiers.set(s.postingId, tier);
  });
  return tiers;
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function clampScore(x: unknown): number {
  const n = typeof x === 'number' && Number.isFinite(x) ? x : 50;
  return Math.round(Math.min(100, Math.max(0, n)));
}
