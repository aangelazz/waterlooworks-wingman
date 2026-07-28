import PostingCard from './PostingCard';
import type { AgentAnalysis, Posting, Tier } from '../lib/types';

const TIER_META: Record<Tier, { className: string; blurb: string }> = {
  S: { className: 'text-amber-300', blurb: 'apply first — best blend of fit and odds' },
  A: { className: 'text-emerald-300', blurb: 'strong picks' },
  B: { className: 'text-sky-300', blurb: 'worth an application' },
  C: { className: 'text-ink-faint', blurb: 'deprioritize' },
};

export default function TierList({
  postings,
  analyses,
}: {
  postings: Posting[];
  analyses: AgentAnalysis[];
}) {
  if (postings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge-strong bg-surface p-10 text-center text-ink-mid">
        <p className="font-display text-lg text-ink">No postings yet</p>
        <p className="mt-1.5 text-sm">
          Paste WaterlooWorks postings below, or load the demo data — then rank them against
          your preferences.
        </p>
      </div>
    );
  }

  const byId = new Map(analyses.map((a) => [a.postingId, a]));
  const postingById = new Map(postings.map((p) => [p.id, p]));

  if (analyses.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-mid">
          {postings.length} posting{postings.length === 1 ? '' : 's'} loaded with competition
          odds. Enter your preferences above and hit{' '}
          <span className="font-medium text-ink">Rank my jobs</span> for the S/A/B/C tier
          list with flags and rationale.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {postings.map((p) => (
            <PostingCard key={p.id} posting={p} />
          ))}
        </div>
      </div>
    );
  }

  const tiers: Tier[] = ['S', 'A', 'B', 'C'];
  return (
    <div className="space-y-5">
      {tiers.map((tier) => {
        const rows = analyses
          .filter((a) => a.tier === tier && postingById.has(a.postingId))
          .sort((a, b) => b.finalScore - a.finalScore);
        if (rows.length === 0) return null;
        const meta = TIER_META[tier];
        return (
          <section key={tier}>
            <div className="mb-3 flex items-baseline gap-3">
              <span
                className={`font-display text-2xl font-semibold leading-none ${meta.className}`}
              >
                {tier}
              </span>
              <span className="text-xs text-ink-faint">{meta.blurb}</span>
              <span aria-hidden className="h-px flex-1 self-center bg-edge" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((a) => (
                <PostingCard
                  key={a.postingId}
                  posting={postingById.get(a.postingId)!}
                  analysis={byId.get(a.postingId)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
