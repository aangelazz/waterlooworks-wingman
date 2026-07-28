import { ODDS_BAND_META, oddsBand, oddsScore } from '../lib/score';
import type { AgentAnalysis, Posting } from '../lib/types';

export function OddsBadge({ posting }: { posting: Posting }) {
  const score = oddsScore(posting.applications, posting.openings);
  const band = oddsBand(score, posting.applications);
  const meta = ODDS_BAND_META[band];
  const detail =
    posting.applications != null
      ? `${posting.applications} apps / ${posting.openings ?? '?'} opening${(posting.openings ?? 2) === 1 ? '' : 's'} — ${meta.label}`
      : meta.label;
  return (
    <span
      title={`Odds score ${score}/100 (from applications-per-opening ratio)`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${meta.className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dotClass}`} />
      {detail}
    </span>
  );
}

function ScorePill({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-mid">
      {label}{' '}
      <span className="font-semibold tabular-nums text-ink">{value ?? '–'}</span>
    </span>
  );
}

export default function PostingCard({
  posting,
  analysis,
}: {
  posting: Posting;
  analysis?: AgentAnalysis;
}) {
  const meta = [
    posting.location,
    posting.arrangement,
    posting.duration,
    posting.hourlyRate != null ? `~$${posting.hourlyRate}/hr` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-lg border border-edge bg-surface p-4 transition-colors hover:border-edge-strong">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{posting.title}</h3>
          <p className="text-sm text-ink-mid">
            {posting.organization}
            {posting.division ? ` · ${posting.division}` : ''}
          </p>
          {meta && <p className="mt-0.5 text-xs text-ink-faint">{meta}</p>}
        </div>
        <OddsBadge posting={posting} />
      </div>

      {analysis && (
        <div className="mt-3 space-y-2 border-t border-edge pt-3">
          <p className="text-sm text-ink-mid">{analysis.rationale}</p>
          {(analysis.greenFlags.length > 0 || analysis.redFlags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {analysis.greenFlags.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300"
                >
                  <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                  {f}
                </span>
              ))}
              {analysis.redFlags.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2 py-0.5 text-xs text-rose-300"
                >
                  <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-rose-400" />
                  {f}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <ScorePill label="fit" value={analysis.fitScore} />
            <ScorePill label="odds" value={analysis.oddsScore} />
            <ScorePill label="sim" value={analysis.simScore} />
            <ScorePill label="final" value={analysis.finalScore} />
          </div>
        </div>
      )}
    </div>
  );
}
