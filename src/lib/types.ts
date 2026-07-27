export type Provider = 'gemini' | 'groq';

export type NormalizedStatus =
  | 'applied'
  | 'selected_for_interview'
  | 'interviewed'
  | 'not_selected'
  | 'offer'
  | 'employed'
  | 'withdrawn'
  | 'other';

export interface Application {
  id: string;                 // WaterlooWorks Job ID if present, else generated
  title: string;
  organization: string;
  division?: string;
  rawStatus: string;          // exact App Status text, e.g. "Selected for Interview"
  status: NormalizedStatus;   // normalized
  jobStatus?: string;         // WaterlooWorks "Job Status" column: Filled / Part Filled / Cancel / Stalled / …
  openings?: number | null;   // per-row Openings count when present
}

/** "You have submitted N of 500 applications for the current recruiting term." */
export interface TermStat {
  submitted: number;
  cap: number;
}

export interface Posting {
  id: string;                 // Job ID if present, else generated
  title: string;
  organization: string;
  division?: string;
  location?: string;          // city/region string
  arrangement?: 'in-person' | 'remote' | 'hybrid' | null;
  duration?: string;          // e.g. "4 month", "8 month"
  compensation?: string;      // raw text of comp field
  hourlyRate?: number | null; // best-effort number extracted from comp text
  summary?: string;
  skills?: string;            // required skills text
  applications?: number | null; // "X applications"
  openings?: number | null;     // "Y openings"
  deadline?: string | null;
  raw: string;                // original pasted chunk (for embedding + re-analysis)
}

export interface Preferences {
  freeText: string;           // "remote or Toronto, React/TS, product-y teams, $30+/hr"
}

export type Tier = 'S' | 'A' | 'B' | 'C';

export interface AgentAnalysis {
  postingId: string;
  fitScore: number;           // 0–100, LLM judgment vs preferences
  oddsScore: number;          // 0–100, deterministic from openings/applications
  simScore: number | null;    // 0–100, cosine(prefText, posting) — null until embeddings load
  finalScore: number;         // 0.55*fit + 0.25*odds + 0.20*sim (reweighted if sim null)
  tier: Tier;
  rationale: string;          // 1–2 sentences
  greenFlags: string[];
  redFlags: string[];
}

export interface MapPoint {
  postingId: string;
  x: number;
  y: number;                  // PCA 2D
  cluster: number;            // k-means label
}

/** Tiny id generator (no nanoid dependency). */
export function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}
