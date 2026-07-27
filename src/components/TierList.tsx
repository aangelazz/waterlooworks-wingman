import PostingCard from './PostingCard';
import type { AgentAnalysis, Posting, Tier } from '../lib/types';

const TIER_META: Record<Tier, { className: string; blurb: string }> = {
  S: { className: 'bg-amber-400 text-amber-950', blurb: 'apply first — best blend of fit and odds' },
  A: { className: 'bg-emerald-400 text-emerald-950', blurb: 'strong picks' },
  B: { className: 'bg-sky-400 text-sky-950', blurb: 'worth an application' },
  C: { className: 'bg-slate-300 text-slate-700', blurb: 'deprioritize' },
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
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        <p className="text-lg font-medium text-slate-600">No postings yet</p>
        <p className="mt-1 text-sm">
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
        <p className="text-sm text-slate-500">
          {postings.length} posting{postings.length === 1 ? '' : 's'} loaded with competition
          odds. Enter your preferences above and hit{' '}
          <span className="font-medium text-slate-700">Rank my jobs</span> for the S/A/B/C tier
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
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg font-black ${meta.className}`}
              >
                {tier}
              </span>
              <span className="text-xs text-slate-500">{meta.blurb}</span>
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
