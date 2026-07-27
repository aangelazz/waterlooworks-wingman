# WaterlooWorks Wingman — Build Plan

A ~2-hour solo hackathon project (Hack the North application submission). Zero-backend static site: **Vite + React + TypeScript + Tailwind**. All AI runs in or from the browser: **transformers.js** embeddings (all-MiniLM-L6-v2, WebGPU → WASM fallback) + a **BYOK LLM agent** (Gemini or Groq free tier, key in localStorage, called via REST from the browser). Postings never leave the browser except in the user's own LLM API calls with their own key.

---

## 1. Project pitch

WaterlooWorks Wingman is a privacy-first copilot for UWaterloo co-op applications: paste your WaterlooWorks postings and "My Applications" page, and an in-browser AI agent parses them, tracks your application statuses, scores your realistic odds from applications-to-openings ratios, flags red/green signals, and ranks everything into an S/A/B/C tier list against your stated preferences — with an embedding-powered similarity map of the whole job landscape. No backend, no scraping, no login: your data stays in your browser, and the LLM runs on your own free-tier key.

## 2. User pain points (from research)

Sourced from r/uwaterloo threads, Imprint (student paper) coverage, and the community-extension ecosystem (WaterlooWorks Azure, UWFlow-for-WW, Goose Glance):

- **Tracking applications in WaterlooWorks is so bad students use the shortlist as a hack.** Students literally advise keeping jobs on the Short List *after* applying because "it is easier to see their status in your shortlist than in the Applied To section." The Applied-To view is a weak status tracker; there's no funnel view, no stats. → *Feature 1 (tracker)*.
- **Walls of dense text, horizontal scrolling, "practically unusable" UI.** Students describe being "completely drained" after an application session; the existence of multiple community extensions built solely to "fix everything that needs to be fixed" is itself evidence. Goose Glance (the one actively maintained tool) exists purely to summarize postings so students don't paste them into ChatGPT manually. → *Features 2, 4 (shortlisting, flags)*.
- **Search/filter is unintuitive and unreliable** — returns jobs "outside the scope of your program," filters spontaneously reset mid-browse. No semantic search, no preference-based ranking. → *Features 2, 5 (preference ranking, similarity map)*.
- **No help managing competition.** Postings show application counts, but WaterlooWorks gives "no great way to see how many applicants per job in a usable way" or to strategically trade off long shots vs. good odds. The site is "simply not built to manage the large number of student applications," and students feel the stress of 100s of apps per posting with zero tooling. → *Feature 3 (competition-ratio odds scoring)*.
- **The ranking round is high-stakes and opaque.** Students get limited guidance, can reject only one employer per term, and must rapidly rank offers/interviews with no decision support. → *Feature 6 (S/A/B/C tier list with rationale)*.
- **Existing student tools break and die.** Extensions rely on brittle DOM selectors, break every WaterlooWorks UI update (UWFlow-for-WW died in 2024's redesign), and students are wary of tools that touch their session cookies. Gap identified in research: a tool that "stores everything locally (for privacy)" and doesn't depend on WaterlooWorks' DOM. → *Wingman's paste-based, zero-backend, LLM-parsed design is immune to DOM changes and needs no credentials.*
- **No analytics.** "What's my interview rate?", "which skills appear in postings I liked?" — nothing mainstream exists. → *Tracker stats + similarity map clusters (stretch)*.

## 3. Features: MVP vs Stretch

| # | Feature | Pain point | MVP? |
|---|---------|-----------|------|
| 0 | **Load demo data** button (realistic fake postings + applications) | demo must work without real data | **MVP** |
| 1 | **Application tracker**: paste "My Applications" text → dashboard of title/company/status with badge colors + funnel counts (applied / interview / rejected) | shortlist-as-tracker hack, no funnel view | **MVP** |
| 2 | **Preference-driven shortlisting**: free-text preferences → agent filters + ranks pasted postings | unusable search/filter, drained-by-text | **MVP** |
| 3 | **Competition-ratio odds**: score `openings / applications` per posting, badge it (🟢 good odds / 🟡 competitive / 🔴 long shot), factor into ranking | no competition tooling | **MVP** (deterministic, no AI needed — build first) |
| 4 | **Red/green flag analysis** per posting (from LLM analysis call) | wall-of-text postings hide signals | **MVP** (same LLM call as #2) |
| 6 | **S/A/B/C tier list with rationale** | opaque, stressful ranking round | **MVP** (rendering of #2's output) |
| 5 | **Embedding similarity map**: MiniLM embeddings → PCA to 2D → k-means colors → SVG scatter | can't see the job landscape, no semantic grouping | **Stretch #1** (ship if time; app fully works without it) |
| 7 | Persist parsed data + preferences to localStorage across reloads | — | Stretch (cheap, do if trivial) |
| 8 | Interview-rate / per-company analytics in tracker | no analytics | Stretch |
| 9 | Semantic search box over embedded postings | bad search | Stretch |

MVP definition of done: paste (or demo-load) → tracker renders; enter preferences → tier list with rationale, flags, odds badges renders. Similarity map is the wow-factor stretch that reuses the tier list's data.

## 4. Data model (`src/lib/types.ts`)

```ts
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
  id: string;                 // WaterlooWorks Job ID if present, else nanoid
  title: string;
  organization: string;
  division?: string;
  rawStatus: string;          // exact text seen, e.g. "Selected for Interview"
  status: NormalizedStatus;   // LLM-normalized
}

export interface Posting {
  id: string;                 // Job ID if present, else nanoid
  title: string;
  organization: string;
  division?: string;
  location?: string;          // city/region string
  arrangement?: 'in-person' | 'remote' | 'hybrid' | null;
  duration?: string;          // e.g. "4 month", "8 month"
  compensation?: string;      // raw text of comp field
  hourlyRate?: number | null; // best-effort number the LLM extracts
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

export interface AgentAnalysis {
  postingId: string;
  fitScore: number;           // 0–100, LLM judgment vs preferences
  oddsScore: number;          // 0–100, deterministic from openings/applications
  simScore: number | null;    // 0–100, cosine(prefText, posting) — null until embeddings load
  finalScore: number;         // 0.55*fit + 0.25*odds + 0.20*sim (fit-weighted if sim null)
  tier: 'S' | 'A' | 'B' | 'C';
  rationale: string;          // 1–2 sentences
  greenFlags: string[];
  redFlags: string[];
}

export interface MapPoint {
  postingId: string;
  x: number; y: number;       // PCA 2D
  cluster: number;            // k-means label
}
```

## 5. Architecture

### File layout

```
index.html
src/
  main.tsx
  App.tsx                 // tab shell: Tracker | Shortlist | Map; settings gear
  index.css               // @import "tailwindcss"
  lib/
    types.ts
    storage.ts            // localStorage get/set: apiKey, provider, saved state
    llm.ts                // chatJSON(prompt, schema): provider-agnostic REST call
    parse.ts              // extractPostings(text), extractApplications(text) via llm.ts
    agent.ts              // analyze(postings, prefs): LLM fit/flags + blend + tiering
    score.ts              // oddsScore(apps, openings), blendScores(), tierFor()
    embeddings.ts         // lazy transformers.js pipeline, embed(texts), cosine
    cluster.ts            // pca2d(vectors), kmeans(vectors, k)
    demoData.ts           // ~10 realistic fake postings + ~8 applications
  components/
    SettingsModal.tsx     // BYOK: provider select + key input, saved to localStorage
    PasteImport.tsx       // big textarea + "Parse" + "Load demo data"
    Tracker.tsx           // applications table + StatusBadge + funnel counts
    PreferencesBar.tsx    // free-text input + "Rank my jobs" button
    TierList.tsx          // S/A/B/C rows of PostingCard
    PostingCard.tsx       // title/org/odds badge/flags/rationale
    SimilarityMap.tsx     // SVG scatter, hover tooltip, cluster colors
```

No router, no state library — `useState` in `App.tsx`, props down. No chart lib — hand-rolled SVG scatter (~60 lines).

### BYOK (bring your own key)

- Settings modal: pick provider (Gemini default — best free tier + JSON schema support; Groq alt) and paste key. Stored as `localStorage["wingman.provider" | "wingman.apiKey"]`. Banner prompts for a key if any AI action is attempted without one.
- `llm.ts` exposes one function:

```ts
async function chatJSON<T>(system: string, user: string, schema: object): Promise<T>
```

- **Gemini**: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=KEY` with `generationConfig: { responseMimeType: "application/json", responseSchema: schema }`. CORS-friendly, schema-enforced JSON.
- **Groq**: `POST https://api.groq.com/openai/v1/chat/completions`, model `llama-3.3-70b-versatile`, `response_format: {type:"json_object"}`, schema embedded in the system prompt. CORS-friendly.
- Response hardening in one place: strip ```json fences, `JSON.parse`, on failure retry once with "Return ONLY valid JSON" appended.

### Agent loop (pragmatic pipeline, not open-ended tool calling)

Fixed 2–3 step pipeline — reliable and cheap on free tiers:

1. **Extract** (1 call per paste): pasted text → `Posting[]` or `Application[]` JSON (see §6). The paste box asks the user which page it is (postings vs. My Applications) via two buttons — no auto-detect needed.
2. **Analyze** (1 call): all postings (id + title + org + location + comp + truncated summary/skills, ~300 chars each) + `preferences.freeText` → per-posting `{fitScore, greenFlags, redFlags, rationale}` array. One batched call for all postings.
3. **Synthesize** (pure TS, `score.ts` + `agent.ts`): deterministic `oddsScore` from ratio; if embeddings are loaded, `simScore = cosine(embed(prefText), embed(posting.raw))`; blend → `finalScore` → tiers by rank quantile (top 10% S, next 25% A, next 40% B, rest C — never let the LLM assign tiers directly, so tiers stay well-distributed).

This is "agentic" in the demo narrative (perceive → extract → judge → synthesize) but has no unbounded loops to debug.

### Embeddings + WebGPU fallback (`embeddings.ts`)

```ts
import { pipeline } from "@huggingface/transformers";

let p: Promise<any> | null = null;
export function getExtractor(onProgress?: (p: number) => void) {
  p ??= pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2",
        { device: "webgpu", dtype: "q8", progress_callback: cb })
    .catch(() => pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2",
        { device: "wasm", dtype: "q8", progress_callback: cb }));
  return p;
}
// embed(texts): pooling: "mean", normalize: true → Float32Array[384] each
```

- Lazy: model (~25 MB quantized) downloads only when the Map tab is first opened; progress bar from `progress_callback`. Cached by the browser afterward.
- Graceful degradation: everything except the map and `simScore` works with zero downloads; `finalScore` reweights to fit+odds when `simScore` is null.

### Clustering (`cluster.ts`)

- **PCA to 2D**: center vectors, power-iteration for top-2 components (~40 lines, no deps).
- **k-means**: k = min(4, floor(n/3)), 20 iterations, k-means++ init not needed — random init fine at this scale.
- `SimilarityMap.tsx`: SVG scatter, points colored by cluster, sized/ringed by tier, tooltip on hover with title/org.

## 6. Parsing strategy

**Primary: LLM extraction with a strict JSON schema.** Copy-pasted WaterlooWorks text is messy (table cells collapse, section headers vary, the UI changed in 2024 and killed every regex-based student tool). An LLM with a schema is robust to all of that — this is the key design bet and it's also why this tool can't rot like the DOM-scraping extensions did.

One extraction prompt per paste type:

- `extractApplications(text)` → schema: array of `{id?, title, organization, division?, rawStatus, status}`. Prompt tells the model the paste is the WaterlooWorks **"My Applications"** table whose columns typically include **Job Title, Organization, Division, Job Status/App Status**, and that status values include: `Applied`, `Selected for Interview`, `Not Selected`, `Interviewed`, `Offer`, `Employed`, `Application Withdrawn` — and to map anything else to `other` while preserving `rawStatus` verbatim.
- `extractPostings(text)` → schema: array of Posting fields. Prompt lists the real WaterlooWorks posting section labels found in research so the model anchors on them (research confirmed these exact student-facing labels): **Job ID** (in the posting heading), **Job Title**, **Organization**, **Division**, **Job location**, **Employment location arrangement** (in-person/remote/hybrid), **Work term duration**, **Job summary**, **Job responsibilities**, **Required skills**, **Compensation and benefits information**, **Targeted degrees and disciplines**, **Application Deadline**, plus counts appearing as **"N applications"** and openings ("Number of Job Openings" / "Openings"). Instruct: unknown → `null`, never invent numbers, extract `hourlyRate` as a number only when comp text states one.

Deterministic assists in `parse.ts` (cheap, before/after the LLM call):

- Chunk pastes > ~12k chars on posting boundaries (`Job ID` / blank-line runs) and merge results, so one giant paste doesn't blow context.
- Regex safety net for the two numbers the ranking depends on: `/(\d[\d,]*)\s*applications?/i` and `/(\d[\d,]*)\s*openings?/i` per chunk — if the LLM returned null but regex hits, backfill.
- If "My Applications" was copied as TSV (browser table copy), a 5-line tab-split fast path parses it with zero LLM tokens; fall back to LLM otherwise.

`demoData.ts` fake postings must mirror the real field labels above verbatim in their `raw` text, so the demo exercises the same parser path as real data.

## 7. Milestones (~2-hour build, each independently demo-able)

| # | Time | Deliverable | Demo-able as |
|---|------|-------------|--------------|
| M0 | 0:00–0:15 | Scaffold: `npm create vite@latest` (react-ts), Tailwind v4 via `@tailwindcss/vite`, App shell with 3 tabs, `types.ts`, `demoData.ts`, "Load demo data" wired into state | Static dashboard with demo postings listed |
| M1 | 0:15–0:30 | `score.ts` odds scoring + `Tracker.tsx` + `StatusBadge` + funnel counts, `PostingCard` with odds badges — all on demo data, **no AI yet** | Tracker + competition-odds badges working end-to-end |
| M2 | 0:30–0:50 | `storage.ts`, `SettingsModal` (BYOK), `llm.ts` (`chatJSON` for Gemini+Groq), `parse.ts` extraction; `PasteImport` parses real pasted text into the same views | Paste real WaterlooWorks text → parsed dashboard |
| M3 | 0:50–1:20 | `agent.ts` analyze pipeline + `PreferencesBar` + `TierList` + flags/rationale on `PostingCard` | Type preferences → S/A/B/C tier list with rationale, flags, odds |
| M4 | 1:20–1:45 | `embeddings.ts` (lazy, WebGPU→WASM) + `cluster.ts` + `SimilarityMap` tab with progress bar; wire `simScore` into blend | Clustered 2D map of postings, tier-ringed |
| M5 | 1:45–2:00 | Polish: empty states, key-missing banner, header/tagline, favicon, `vite build` sanity, run the demo script once | Final demo |

Cut lines if behind: M4 is fully cuttable (blend already degrades); M2's Groq path is cuttable (Gemini only); never cut M1 or M3.

## 8. Demo script (60 seconds)

1. **(0–10s)** "Every Waterloo co-op student fights WaterlooWorks — students literally use the shortlist as a fake tracker and paste postings into ChatGPT one at a time. Wingman fixes that, with zero backend: your data never leaves the browser."
2. **(10–20s)** Click **Load demo data** → tracker dashboard appears: status badges, funnel (12 applied / 3 interviews / 4 rejected).
3. **(20–35s)** Switch to Shortlist tab. Type preferences: *"remote or Toronto, React/TypeScript, small product teams, $30+/hr"* → **Rank my jobs**. S/A/B/C tier list streams in: each card shows odds badge ("🔴 212 apps / 2 openings — long shot"), green/red flags, one-line rationale.
4. **(35–50s)** Open the **Map** tab: "an on-device transformer — running on WebGPU, right here in the tab — embeds every posting" → clustered scatter appears; hover a cluster: "here's the fintech cluster, here's embedded/hardware."
5. **(50–60s)** "LLM on my own free Gemini key, embeddings fully in-browser, nothing stored anywhere but localStorage. Built in two hours."

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| MiniLM download (~25 MB) slow/fails on demo network | Lazy-load only on Map tab; progress bar; app fully functional without it (blend reweights). Pre-warm cache before recording the demo. |
| WebGPU unavailable (Safari/older Chrome/no flag) | Automatic `.catch` fallback to WASM device in `embeddings.ts`; WASM is fast enough for ≤50 postings × 384 dims. |
| Free-tier rate limits (Gemini ~10–15 RPM) / quota | Entire flow uses 2–3 LLM calls per session (batched extract + batched analyze). Truncate posting text in the analyze call. Retry-once with backoff on 429. |
| LLM returns malformed JSON | Gemini `responseSchema` enforces structure; Groq path strips fences + one retry; all parsing behind a single `chatJSON` chokepoint. |
| Paste format variance (old vs new WW UI, table vs detail copy, TSV vs plain) | LLM extraction (format-agnostic) + regex backfill for the two critical numbers + TSV fast path. Demo data exercises the same path, so demo never depends on live WaterlooWorks. |
| Giant pastes blow context | Chunk on posting boundaries at ~12k chars, merge arrays. |
| CORS blocks a provider from the browser | Gemini and Groq both allow browser CORS today; if one breaks day-of, switch provider in settings (both implemented in `llm.ts`). |
| 2-hour overrun | Milestones ordered so M1 (no-AI odds + tracker) and M3 (tier list) are the demo core; M4 map is the first cut. |
| Key security perception | Key only in localStorage, only sent to the user's chosen provider; state this in the UI footer and the demo. |

## 10. Research appendix (for prompt-writing)

Confirmed/likely WaterlooWorks strings to anchor extraction prompts and demo data:

- Posting sections (student view, confirmed labels): `Job location`, `Employment location arrangement`, `Work term duration`, `Job summary`, `Job responsibilities`, `Required skills`, `Compensation and benefits information`, `Targeted degrees and disciplines`, `Company information`; `Job ID` appears in the posting heading; deadline appears as `Application Deadline`; document list under `Application Documents Required`.
- Applications/openings counts: student list views show counts like "`N` applications"; employer side calls it `Apps`. Parser should regex both `applications` and `openings` words.
- My Applications table: has an `App Status` (or `Job Status`) column; identity columns `Job Title`, `Organization`, `Division`. Status strings to normalize: `Applied`, `Selected for Interview`, `Not Selected`, `Interviewed`, `Offer`, `Employed`, `Application Withdrawn` (+ pass-through `rawStatus` for anything else).
- Boards students use: `Applied To`, `For My Program`, `Short List` — good vocabulary for UI copy.
- Competitive landscape: Goose Glance (AI per-posting summaries, BYOK/local models, actively maintained) proves demand for LLM help but does **no** multi-job ranking, tracking, or analytics — exactly Wingman's lane. DOM-scraping tools (UWFlow-for-WW, Azure) die on every UI update — paste-based design sidesteps this.
