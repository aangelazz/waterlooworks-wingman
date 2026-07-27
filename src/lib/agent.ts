import { chatJSON } from './llm';
import { assignTiers, blendScores, clampScore, oddsScore } from './score';
import type { AgentAnalysis, Posting, Preferences } from './types';

const analysisSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          postingId: { type: 'string' },
          fitScore: {
            type: 'number',
            description: '0-100 fit vs the stated preferences',
          },
          greenFlags: { type: 'array', items: { type: 'string' } },
          redFlags: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string', description: '1-2 sentences' },
        },
        required: ['postingId', 'fitScore', 'greenFlags', 'redFlags', 'rationale'],
      },
    },
  },
  required: ['items'],
};

interface RawAnalysis {
  postingId?: string;
  fitScore?: number;
  greenFlags?: unknown;
  redFlags?: unknown;
  rationale?: string;
}

/**
 * Thrown when some analyze batches succeeded before a call failed — carries
 * the completed (retiered) analyses so the UI can show partial progress.
 */
export class PartialAnalysisError extends Error {
  analyses: AgentAnalysis[];
  constructor(message: string, analyses: AgentAnalysis[]) {
    super(message);
    this.name = 'PartialAnalysisError';
    this.analyses = analyses;
  }
}

function compact(p: Posting): string {
  const details = [
    `id: ${p.id}`,
    `title: ${p.title}`,
    `org: ${p.organization}`,
    p.location ? `location: ${p.location}` : null,
    p.arrangement ? `arrangement: ${p.arrangement}` : null,
    p.duration ? `duration: ${p.duration}` : null,
    p.compensation ? `compensation: ${p.compensation.slice(0, 120)}` : null,
    p.applications != null
      ? `applications: ${p.applications} for ${p.openings ?? '?'} opening(s)`
      : null,
    p.summary ? `summary: ${p.summary.slice(0, 300)}` : null,
    p.skills ? `skills: ${p.skills.slice(0, 200)}` : null,
  ].filter(Boolean);
  return details.join(' | ');
}

/** Postings per analyze call — keeps each response comfortably under the
 * 8,192 output-token cap (Gemini) and each request under free-tier TPM
 * limits (Groq); one giant call truncates mid-array at ~70+ postings. */
const ANALYZE_BATCH = 25;

/**
 * The "agent" pipeline, step 2+3: batched LLM calls (~25 postings each) judge
 * fit + flags for every posting against the user's preferences, then pure TS
 * blends the deterministic odds score (and similarity score when embeddings
 * are loaded) into a final score and assigns S/A/B/C tiers by rank quantile
 * once, after all batches. The LLM never assigns tiers or sees the odds math
 * — keeps tiers well-distributed and the competition signal untampered.
 *
 * If a mid-batch call fails, completed batches are preserved and surfaced via
 * PartialAnalysisError instead of being discarded.
 */
export async function analyze(
  postings: Posting[],
  prefs: Preferences,
  simScores?: Map<string, number> | null,
): Promise<AgentAnalysis[]> {
  const system = `You are a co-op application advisor for a University of Waterloo student. For EACH posting provided, judge how well it fits the student's stated preferences (fitScore 0-100, where 50 is neutral/unknown fit), list up to 3 short green flags (genuinely attractive signals: strong mentorship, real ownership, relevant stack, good pay, matches preferences) and up to 3 short red flags (vague descriptions, low pay for the field, mismatched location/stack, suspicious signals). Write a 1-2 sentence rationale referencing the preferences. Echo each posting's id as postingId exactly. Return one item per posting — do not skip any.`;

  const analyses: AgentAnalysis[] = [];
  for (let start = 0; start < postings.length; start += ANALYZE_BATCH) {
    const batch = postings.slice(start, start + ANALYZE_BATCH);
    const user = `Student preferences: ${prefs.freeText || '(none stated — judge general co-op quality)'}\n\nPostings:\n${batch
      .map((p, i) => `${i + 1}. ${compact(p)}`)
      .join('\n')}`;

    let items: RawAnalysis[];
    try {
      const result = await chatJSON<{ items: RawAnalysis[] }>(
        system,
        user,
        analysisSchema,
      );
      items = Array.isArray(result?.items) ? result.items : [];
    } catch (e) {
      // Keep the batches that already succeeded instead of discarding them.
      if (analyses.length === 0) throw e;
      const reason = e instanceof Error ? e.message : 'request failed';
      throw new PartialAnalysisError(
        `Ranked ${analyses.length} of ${postings.length} postings, then a call failed (${reason}). Showing the ranked ones — hit "Rank my jobs" again in a minute for the rest.`,
        retier(analyses),
      );
    }

    const byId = new Map<string, RawAnalysis>();
    items.forEach((it) => {
      if (it.postingId) byId.set(String(it.postingId), it);
    });

    batch.forEach((p, i) => {
      // Match by id; fall back to positional match if the model garbled ids.
      const it =
        byId.get(p.id) ?? (items.length === batch.length ? items[i] : undefined);
      const fit = clampScore(it?.fitScore);
      const odds = oddsScore(p.applications, p.openings);
      const sim = simScores?.get(p.id) ?? null;
      analyses.push({
        postingId: p.id,
        fitScore: fit,
        oddsScore: odds,
        simScore: sim,
        finalScore: blendScores(fit, odds, sim),
        tier: 'C' as const,
        rationale:
          typeof it?.rationale === 'string' && it.rationale
            ? it.rationale
            : 'No rationale returned for this posting.',
        greenFlags: strArray(it?.greenFlags),
        redFlags: strArray(it?.redFlags),
      });
    });
  }

  return retier(analyses);
}

/**
 * Pure re-blend: called when embeddings finish loading after an analysis
 * already exists, so simScore folds into finalScore without another LLM call.
 */
export function reblend(
  analyses: AgentAnalysis[],
  simScores: Map<string, number>,
): AgentAnalysis[] {
  const updated = analyses.map((a) => {
    const sim = simScores.get(a.postingId) ?? a.simScore;
    return {
      ...a,
      simScore: sim,
      finalScore: blendScores(a.fitScore, a.oddsScore, sim),
    };
  });
  return retier(updated);
}

function retier(analyses: AgentAnalysis[]): AgentAnalysis[] {
  const tiers = assignTiers(
    analyses.map((a) => ({ postingId: a.postingId, finalScore: a.finalScore })),
  );
  return analyses.map((a) => ({ ...a, tier: tiers.get(a.postingId) ?? 'C' }));
}

function strArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').slice(0, 3)
    : [];
}
