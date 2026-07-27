import type { Application, NormalizedStatus, TermStat } from '../lib/types';

const STATUS_META: Record<NormalizedStatus, { label: string; className: string }> = {
  applied: { label: 'Applied', className: 'bg-sky-100 text-sky-800' },
  selected_for_interview: {
    label: 'Selected for Interview',
    className: 'bg-violet-100 text-violet-800',
  },
  interviewed: { label: 'Interviewed', className: 'bg-indigo-100 text-indigo-800' },
  not_selected: { label: 'Not Selected', className: 'bg-rose-100 text-rose-800' },
  offer: { label: 'Offer', className: 'bg-emerald-100 text-emerald-800' },
  employed: { label: 'Employed', className: 'bg-emerald-200 text-emerald-900' },
  withdrawn: { label: 'Withdrawn', className: 'bg-slate-200 text-slate-600' },
  other: { label: 'Other', className: 'bg-slate-100 text-slate-600' },
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
    <div className="flex-1 min-w-28 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function jobStatusClass(jobStatus: string): string {
  if (/^filled/i.test(jobStatus)) return 'text-slate-600';
  if (/part filled/i.test(jobStatus)) return 'text-amber-700';
  if (/cancel|stalled|expired/i.test(jobStatus)) return 'text-slate-400 line-through';
  return 'text-slate-500';
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
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        <p className="text-lg font-medium text-slate-600">No applications yet</p>
        <p className="mt-1 text-sm">
          Paste your WaterlooWorks <span className="font-medium">My Applications</span> page
          below, or load the demo data to see the tracker in action.
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
        <p className="text-sm text-slate-600">
          You have submitted{' '}
          <span className="font-semibold text-slate-800">{termStat.submitted}</span> of{' '}
          {termStat.cap} applications for the current recruiting term.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <FunnelStat label="Total applications" value={applications.length} accent="text-slate-800" />
        <FunnelStat label="Awaiting response" value={count('applied')} accent="text-sky-600" />
        <FunnelStat label="Interview stage" value={interviewStage} accent="text-violet-600" />
        <FunnelStat label="Offers" value={offers} accent="text-emerald-600" />
        <FunnelStat label="Rejected" value={rejected} accent="text-rose-600" />
      </div>
      <p className="text-xs text-slate-500">
        Interview rate so far:{' '}
        <span className="font-semibold text-slate-700">{interviewRate}%</span> (interviews +
        offers over total applications)
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
              <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{a.title}</td>
                <td className="px-4 py-3 text-slate-600">{a.organization}</td>
                <td className="px-4 py-3 text-slate-500 max-sm:hidden">{a.division ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={a.status} rawStatus={a.rawStatus} />
                </td>
                <td
                  className={`px-4 py-3 text-xs max-sm:hidden ${a.jobStatus ? jobStatusClass(a.jobStatus) : 'text-slate-300'}`}
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
