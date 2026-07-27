import { chatJSON } from './llm';
import type { Application, NormalizedStatus, Posting, TermStat } from './types';
import { uid } from './types';

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, NormalizedStatus> = {
  'applied': 'applied',
  'selected for interview': 'selected_for_interview',
  'interview selected': 'selected_for_interview',
  'interviewed': 'interviewed',
  'not selected': 'not_selected',
  'offer': 'offer',
  'offer extended': 'offer',
  'employed': 'employed',
  'application withdrawn': 'withdrawn',
  'withdrawn': 'withdrawn',
};

export function normalizeStatus(rawStatus: string): NormalizedStatus {
  const key = rawStatus.trim().toLowerCase();
  if (STATUS_MAP[key]) return STATUS_MAP[key];
  for (const [needle, status] of Object.entries(STATUS_MAP)) {
    if (key.includes(needle)) return status;
  }
  return 'other';
}

/**
 * "You have submitted N of 500 applications for the current recruiting term."
 * appears in the real My Applications page header — a free stat for the
 * tracker.
 */
export function extractTermStat(text: string): TermStat | null {
  const m =
    /you have submitted\s+([\d,]+)\s+of\s+([\d,]+)\s+applications/i.exec(text);
  if (!m) return null;
  const submitted = parseCount(m[1]);
  const cap = parseCount(m[2]);
  return submitted != null && cap != null ? { submitted, cap } : null;
}

const APPS_RE = /(\d[\d,]*)\s*applications?\b/i;
// Handles both "Number of Job Openings 2" / "Openings: 2" and "2 openings".
const OPENINGS_LABEL_RE = /(?:number of job openings|openings?)\s*:?\s*(\d[\d,]*)/i;
const OPENINGS_COUNT_RE = /(\d[\d,]*)\s*openings?\b/i;

function parseCount(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Regex safety net for the two numbers the ranking depends on. */
export function extractCounts(text: string): {
  applications: number | null;
  openings: number | null;
} {
  const apps = parseCount(APPS_RE.exec(text)?.[1]);
  const openings =
    parseCount(OPENINGS_LABEL_RE.exec(text)?.[1]) ??
    parseCount(OPENINGS_COUNT_RE.exec(text)?.[1]);
  return { applications: apps, openings };
}

/** Split a big paste into per-posting segments on "Job ID" boundaries. */
export function splitPostingSegments(text: string): string[] {
  const segs = text
    .split(/(?=\bJob ID\b)/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return segs.length > 0 ? segs : [text];
}

/** Greedily pack posting segments into chunks ≤ maxLen chars for LLM calls. */
export function chunkPostingText(text: string, maxLen = 12000): string[] {
  if (text.length <= maxLen) return [text];
  const segments = splitPostingSegments(text).flatMap((seg) =>
    seg.length <= maxLen ? [seg] : hardSplit(seg, maxLen),
  );
  const chunks: string[] = [];
  let current = '';
  for (const seg of segments) {
    if (current && current.length + seg.length + 2 > maxLen) {
      chunks.push(current);
      current = seg;
    } else {
      current = current ? current + '\n\n' + seg : seg;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function hardSplit(text: string, maxLen: number): string[] {
  // Last resort: split on blank-line runs, then raw slices.
  const parts = text.split(/\n\s*\n/);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length + 2 > maxLen) {
      out.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
    while (cur.length > maxLen) {
      out.push(cur.slice(0, maxLen));
      cur = cur.slice(maxLen);
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// TSV fast path (browser table copy of "My Applications" → zero LLM tokens)
// ---------------------------------------------------------------------------

export function tsvApplicationsFastPath(text: string): Application[] | null {
  const rows = text
    .split('\n')
    .map((line) => line.split('\t').map((c) => c.trim()))
    .filter((cells) => cells.length > 1);
  if (rows.length < 2) return null;

  const headerIdx = rows.findIndex(
    (cells) =>
      cells.some((c) => /job title/i.test(c)) &&
      cells.some((c) => /organization/i.test(c)),
  );
  if (headerIdx === -1) return null;

  const header = rows[headerIdx];
  const col = (re: RegExp) => header.findIndex((c) => re.test(c));
  const iTitle = col(/job title/i);
  const iOrg = col(/organization/i);
  const iDiv = col(/division/i);
  // Real exports have BOTH "App Status" and "Job Status" columns.
  const iAppStatus = col(/app status/i) !== -1 ? col(/app status/i) : col(/status/i);
  const iJobStatus = col(/job status/i);
  const iOpenings = col(/openings/i);
  const iId = col(/job id/i);
  if (iTitle === -1 || iOrg === -1) return null;

  const apps: Application[] = [];
  for (const cells of rows.slice(headerIdx + 1)) {
    const title = cells[iTitle];
    const organization = cells[iOrg];
    if (!title || !organization) continue;
    const rawStatus = (iAppStatus !== -1 && cells[iAppStatus]) || 'Applied';
    apps.push({
      id: (iId !== -1 && cells[iId]) || uid(),
      title,
      organization,
      division: (iDiv !== -1 && cells[iDiv]) || undefined,
      rawStatus,
      status: normalizeStatus(rawStatus),
      jobStatus: (iJobStatus !== -1 && cells[iJobStatus]) || undefined,
      openings: iOpenings !== -1 ? parseCount(cells[iOpenings]) : null,
    });
  }
  return apps.length > 0 ? apps : null;
}

// ---------------------------------------------------------------------------
// Line-block fast path (real "My Applications" copy: one field per line,
// records delimited by "print" lines, column headers each followed by a
// "swap_vert" / "keyboard_arrow_down" sort-icon line). Empty fields appear as
// BLANK lines, so line positions must be preserved — never filter empties.
// ---------------------------------------------------------------------------

const SORT_ICON_RE = /^(swap_vert|keyboard_arrow_down|keyboard_arrow_up)$/;

export function lineBlockApplicationsFastPath(
  text: string,
): Application[] | null {
  const lines = text.split('\n').map((l) => l.trim());
  const firstPrint = lines.indexOf('print');
  if (firstPrint === -1) return null;

  // Column headers: lines before the first "print" whose next non-blank line
  // is a sort icon.
  const columns: string[] = [];
  for (let i = 0; i < firstPrint; i++) {
    const line = lines[i];
    if (!line || SORT_ICON_RE.test(line)) continue;
    let j = i + 1;
    while (j < firstPrint && !lines[j]) j++;
    if (j < firstPrint && SORT_ICON_RE.test(lines[j])) columns.push(line);
  }
  if (columns.length < 4) return null;

  const col = (re: RegExp) => columns.findIndex((c) => re.test(c));
  const iTitle = col(/job title/i);
  const iId = col(/^job id/i);
  const iOrg = col(/organization/i);
  const iAppStatus = col(/app status/i);
  const iJobStatus = col(/job status/i);
  const iDiv = col(/division/i);
  const iOpenings = col(/openings/i);
  if (iTitle === -1 || iOrg === -1 || iId === -1) return null;

  const apps: Application[] = [];
  let i = firstPrint;
  while (i < lines.length) {
    if (lines[i] !== 'print') {
      i++;
      continue;
    }
    // Collect exactly one line per column, skipping stray "preview" markers
    // but preserving blank lines (they are empty field values).
    const fields: string[] = [];
    let j = i + 1;
    while (j < lines.length && fields.length < columns.length) {
      const line = lines[j];
      if (line === 'preview') {
        j++;
        continue;
      }
      if (line === 'print') break; // malformed record — bail to next
      fields.push(line);
      j++;
    }
    i = j;
    if (fields.length < columns.length) break;

    const id = fields[iId];
    const title = fields[iTitle];
    const organization = fields[iOrg];
    // Job ID must be digits — rejects footer junk misread as a record.
    if (!/^\d+$/.test(id) || !title || !organization) continue;
    const rawStatus = (iAppStatus !== -1 && fields[iAppStatus]) || 'Applied';
    apps.push({
      id,
      title,
      organization,
      division: (iDiv !== -1 && fields[iDiv]) || undefined,
      rawStatus,
      status: normalizeStatus(rawStatus),
      jobStatus: (iJobStatus !== -1 && fields[iJobStatus]) || undefined,
      openings: iOpenings !== -1 ? parseCount(fields[iOpenings]) : null,
    });
  }
  return apps.length > 0 ? apps : null;
}

// ---------------------------------------------------------------------------
// LLM extraction
// ---------------------------------------------------------------------------

const STATUS_VALUES = [
  'applied',
  'selected_for_interview',
  'interviewed',
  'not_selected',
  'offer',
  'employed',
  'withdrawn',
  'other',
];

const applicationsSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', nullable: true, description: 'Job ID digits if present' },
          title: { type: 'string' },
          organization: { type: 'string' },
          division: { type: 'string', nullable: true },
          rawStatus: { type: 'string', description: 'exact App Status text, verbatim' },
          status: { type: 'string', enum: STATUS_VALUES },
          jobStatus: {
            type: 'string',
            nullable: true,
            description: 'Job Status column value, e.g. Filled / Part Filled / Cancel / Stalled',
          },
          openings: { type: 'number', nullable: true },
        },
        required: ['title', 'organization', 'rawStatus', 'status'],
      },
    },
  },
  required: ['items'],
};

interface RawApplication {
  id?: string | null;
  title?: string;
  organization?: string;
  division?: string | null;
  rawStatus?: string;
  status?: string;
  jobStatus?: string | null;
  openings?: number | null;
}

export async function extractApplications(text: string): Promise<Application[]> {
  const fast =
    tsvApplicationsFastPath(text) ?? lineBlockApplicationsFastPath(text);
  if (fast) return fast;

  const system = `You extract structured data from text a student copy-pasted from the WaterlooWorks "My Applications" page (University of Waterloo co-op portal). The table's columns are typically: Job Title, Job ID, Term, Organization, App Status, Job Status, Division, Location, City, Openings, App Deadline, App Submitted On, App Submitted By. Pastes are messy: navigation junk, "swap_vert" sort icons after each column header, and rows delimited by "print" (sometimes "preview") lines with one field per line — blank lines are empty field values. App Status values include: "Applied", "Selected for Interview", "Interviewed", "Not Selected", "Offer", "Employed", "Application Withdrawn". Map each row's App Status to the closest enum value; anything unrecognized maps to "other". Always copy the exact original App Status text into rawStatus verbatim. Job Status is a SEPARATE column (values like "Filled", "Part Filled", "Cancel", "Stalled") — put it in jobStatus verbatim. Include the numeric Job ID as id and the per-row Openings count when visible. Never invent rows that are not in the text.`;
  const user = `Extract every application row from this paste:\n\n${text}`;

  const result = await chatJSON<{ items: RawApplication[] }>(
    system,
    user,
    applicationsSchema,
  );
  const items = Array.isArray(result?.items) ? result.items : [];
  return items
    .filter((a) => a.title && a.organization)
    .map((a) => {
      const rawStatus = a.rawStatus || 'Unknown';
      const status = STATUS_VALUES.includes(a.status ?? '')
        ? (a.status as NormalizedStatus)
        : normalizeStatus(rawStatus);
      return {
        id: a.id || uid(),
        title: a.title!,
        organization: a.organization!,
        division: a.division || undefined,
        rawStatus,
        status,
        jobStatus: a.jobStatus || undefined,
        openings:
          typeof a.openings === 'number' && Number.isFinite(a.openings)
            ? a.openings
            : null,
      };
    });
}

const postingsSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', nullable: true, description: 'Job ID digits if present' },
          title: { type: 'string' },
          organization: { type: 'string' },
          division: { type: 'string', nullable: true },
          location: { type: 'string', nullable: true },
          arrangement: {
            type: 'string',
            enum: ['in-person', 'remote', 'hybrid'],
            nullable: true,
          },
          duration: { type: 'string', nullable: true },
          compensation: { type: 'string', nullable: true },
          hourlyRate: {
            type: 'number',
            nullable: true,
            description: 'only when the compensation text states an hourly number',
          },
          summary: { type: 'string', nullable: true },
          skills: { type: 'string', nullable: true },
          applications: { type: 'number', nullable: true },
          openings: { type: 'number', nullable: true },
          deadline: { type: 'string', nullable: true },
        },
        required: ['title', 'organization'],
      },
    },
  },
  required: ['items'],
};

interface RawPosting {
  id?: string | null;
  title?: string;
  organization?: string;
  division?: string | null;
  location?: string | null;
  arrangement?: string | null;
  duration?: string | null;
  compensation?: string | null;
  hourlyRate?: number | null;
  summary?: string | null;
  skills?: string | null;
  applications?: number | null;
  openings?: number | null;
  deadline?: string | null;
}

/**
 * Thrown when some posting chunks parsed before a call failed — carries the
 * postings that did parse so the UI can keep them instead of losing the lot.
 */
export class PartialExtractionError extends Error {
  postings: Posting[];
  failedChunks: number;
  constructor(message: string, postings: Posting[], failedChunks: number) {
    super(message);
    this.name = 'PartialExtractionError';
    this.postings = postings;
    this.failedChunks = failedChunks;
  }
}

export async function extractPostings(text: string): Promise<Posting[]> {
  const system = `You extract structured job data from text a student copy-pasted from WaterlooWorks job postings (University of Waterloo co-op portal). Postings use these section labels: "Job ID" (in the heading), "Job Title", "Organization", "Division", "Job location", "Employment location arrangement" (in-person / remote / hybrid), "Work term duration", "Job summary", "Job responsibilities", "Required skills", "Compensation and benefits information", "Targeted degrees and disciplines", "Application Deadline". Application counts appear as "N applications" and openings as "Number of Job Openings" or "N openings". Rules: a field you cannot find is null — NEVER invent values, especially numbers. Extract hourlyRate as a number only when the compensation text explicitly states an hourly figure (use the midpoint of a range). Keep summary to at most 3 sentences; keep skills as the raw skills text. One item per distinct posting.`;

  const chunks = chunkPostingText(text);
  const all: Posting[] = [];
  const seen = new Set<string>();

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    let result: { items: RawPosting[] };
    try {
      result = await chatJSON<{ items: RawPosting[] }>(
        system,
        `Extract every job posting from this paste:\n\n${chunk}`,
        postingsSchema,
      );
    } catch (e) {
      // A mid-loop failure (e.g. a 429 on free tier) must not discard the
      // chunks that already parsed.
      if (all.length === 0) throw e;
      const failed = chunks.length - ci;
      const reason = e instanceof Error ? e.message : 'request failed';
      throw new PartialExtractionError(
        `Parsed ${all.length} posting${all.length === 1 ? '' : 's'}, but ${failed} of ${chunks.length} chunks failed (${reason}). Wait a minute and paste the remaining postings again.`,
        all,
        failed,
      );
    }
    const items = Array.isArray(result?.items) ? result.items : [];
    const segments = splitPostingSegments(chunk);
    for (const p of items) {
      if (!p.title || !p.organization) continue;
      const posting = sanitizePosting(p, chunk, segments);
      if (seen.has(posting.id)) continue;
      seen.add(posting.id);
      all.push(posting);
    }
  }
  return all;
}

function sanitizePosting(
  p: RawPosting,
  chunk: string,
  segments: string[],
): Posting {
  // Attach the original text segment for embeddings + regex backfill.
  const raw =
    (p.id && segments.find((s) => s.includes(p.id!))) ??
    (p.title && segments.find((s) => s.includes(p.title!))) ??
    (segments.length === 1 ? segments[0] : chunk);

  const counts = extractCounts(raw);
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;
  const arrangement =
    p.arrangement === 'in-person' ||
    p.arrangement === 'remote' ||
    p.arrangement === 'hybrid'
      ? p.arrangement
      : null;

  return {
    id: str(p.id ?? undefined) || uid(),
    title: p.title!.trim(),
    organization: p.organization!.trim(),
    division: str(p.division ?? undefined),
    location: str(p.location ?? undefined),
    arrangement,
    duration: str(p.duration ?? undefined),
    compensation: str(p.compensation ?? undefined),
    hourlyRate: num(p.hourlyRate),
    summary: str(p.summary ?? undefined),
    skills: str(p.skills ?? undefined),
    // LLM value wins when present; regex backfills when the LLM returned null.
    applications: num(p.applications) ?? counts.applications,
    openings: num(p.openings) ?? counts.openings,
    deadline: str(p.deadline ?? undefined) ?? null,
    raw,
  };
}
