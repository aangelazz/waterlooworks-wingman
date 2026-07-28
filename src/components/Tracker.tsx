import type { Application, NormalizedStatus, TermStat } from '../lib/types';

const STATUS_META: Record<NormalizedStatus, { label: string; className: string }> = {
  applied: { label: 'Applied', className: 'bg-sky-500/10 text-sky-300' },
  selected_for_interview: {
    label: 'Selected for Interview',
    className: 'bg-violet-500/10 text-violet-300',
  },
  interviewed: { label: 'Interviewed', className: 'bg-indigo-500/10 text-indigo-300' },
  not_selected: { label: 'Not Selected', className: 'bg-rose-500/10 text-rose-300' },
  offer: { label: 'Offer', className: 'bg-emerald-500/10 text-emerald-300' },
  employed: { label: 'Employed', className: 'bg-emerald-500/15 text-emerald-200' },
  withdrawn: { label: 'Withdrawn', className: 'bg-surface-2 text-ink-mid' },
  other: { label: 'Other', className: 'bg-surface-2 text-ink-mid' },
};

export function StatusBadge({ status, rawStatus }: { status: NormalizedStatus; rawStatus: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      title={rawStatus}
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${meta.className}`}
    >
      {status === 'other' ? rawStatus : meta.label}
    </span>
  );
}

function FunnelStat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex-1 min-w-28 rounded-lg border border-edge bg-surface px-4 py-3">
      <div className={`font-display text-2xl font-semibold tabular-nums ${accent}`}>{value}</div>
      <div className="mt-0.5 text-xs text-ink-mid">{label}</div>
    </div>
  );
}

function jobStatusClass(jobStatus: string): string {
  if (/^filled/i.test(jobStatus)) return 'text-ink-mid';
  if (/part filled/i.test(jobStatus)) return 'text-amber-300/80';
  if (/cancel|stalled|expired/i.test(jobStatus)) return 'text-ink-faint line-through';
  return 'text-ink-faint';
}

export default function Tracker({
  applications,
  termStat,
}: {
  applications: Application[];
  termStat: TermStat | null;
}) {
  if (applications.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-edge-strong bg-surface p-10 text-center text-ink-mid">
        <p className="font-display text-lg text-ink">No applications yet</p>
        <p className="mt-1.5 text-sm">
          Paste your WaterlooWorks <span className="font-medium text-ink">My Applications</span>{' '}
          page below, or load the demo data to see the tracker in action.
        </p>
      </div>
    );
  }

  const count = (...statuses: NormalizedStatus[]) =>
    applications.filter((a) => statuses.includes(a.status)).length;
  const interviewStage = count('selected_for_interview', 'interviewed');
  const offers = count('offer', 'employed');
  const rejected = count('not_selected');
  const interviewRate =
    applications.length > 0
      ? Math.round(((interviewStage + offers) / applications.length) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {termStat && (
        <p className="text-sm text-ink-mid">
          You have submitted{' '}
          <span className="font-semibold text-ink">{termStat.submitted}</span> of {termStat.cap}{' '}
          applications for the current recruiting term.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <FunnelStat label="Total applications" value={applications.length} accent="text-ink" />
        <FunnelStat label="Awaiting response" value={count('applied')} accent="text-sky-300" />
        <FunnelStat label="Interview stage" value={interviewStage} accent="text-violet-300" />
        <FunnelStat label="Offers" value={offers} accent="text-emerald-300" />
        <FunnelStat label="Rejected" value={rejected} accent="text-rose-300" />
      </div>
      <p className="text-xs text-ink-faint">
        Interview rate so far:{' '}
        <span className="font-semibold text-ink-mid">{interviewRate}%</span> (interviews +
        offers over total applications)
      </p>
      <div className="overflow-x-auto rounded-lg border border-edge bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-edge bg-surface-2 text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-4 py-3">Job Title</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3 max-sm:hidden">Division</th>
              <th className="px-4 py-3">App Status</th>
              <th className="px-4 py-3 max-sm:hidden">Job Status</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a.id} className="border-b border-edge last:border-0 hover:bg-surface-2/60">
                <td className="px-4 py-3 font-medium text-ink">{a.title}</td>
                <td className="px-4 py-3 text-ink-mid">{a.organization}</td>
                <td className="px-4 py-3 text-ink-faint max-sm:hidden">{a.division ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} rawStatus={a.rawStatus} />
                </td>
                <td
                  className={`px-4 py-3 text-xs max-sm:hidden ${a.jobStatus ? jobStatusClass(a.jobStatus) : 'text-ink-faint/60'}`}
                  title={a.jobStatus ? `Posting status: ${a.jobStatus}` : undefined}
                >
                  {a.jobStatus ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
