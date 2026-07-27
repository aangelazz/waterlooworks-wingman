# Build log — WaterlooWorks Wingman

Honest engineering notes per milestone: what got built, the decisions that mattered, and every real problem hit along the way. Written as the build happened (this feeds the "what I learned / challenges" writeup).

---

## M0 — Scaffold (~15 min)

**Built:** Vite + React + TypeScript scaffold at the repo root, Tailwind v4 wired through `@tailwindcss/vite`, `types.ts` data model, `demoData.ts` with 10 fake postings + 8 fake applications.

**Decisions & nuances:**
- Scaffolded with `npm create vite@latest` into a temp dir and moved config files over, since the project root already had `PLAN.md` and create-vite prompts on non-empty dirs. Got Vite 8 (now rolldown-based), React 19, TS 6.
- **Tailwind v4 was the easiest part of the whole build** — no `tailwind.config.js`, no `postcss.config.js`, no `@tailwind base/components/utilities` triplet. One vite plugin + `@import "tailwindcss";` as the entire CSS file. Big change from v3 muscle memory.
- Surprise: the current create-vite react-ts template does **not** set `"strict": true` in `tsconfig.app.json` (it sets `noUnusedLocals` etc. but not strict). Added it manually — a hackathon project with LLM/JSON boundaries desperately needs strict null checks.
- Demo data design rule from the plan: each fake posting's `raw` text mirrors the real WaterlooWorks field labels **verbatim** (`Job ID`, `Job location`, `Employment location arrangement`, `Work term duration`, `Compensation and benefits information`, `N applications`, `Number of Job Openings` …) so demo data exercises the exact same regex/embedding path as real pastes. Demo postings were also written to form deliberate semantic clusters (fintech, embedded/hardware, data/ML, product startups) so the M4 map has visible structure.

**Environment issue (real):** the machine's global `npm` is a corporate toolchain shim that refuses to run ("npm is no longer supported in a global context"). `node` itself was a symlink into a Nix store distribution that ships the real npm alongside it — prepending that Nix `bin` dir to `PATH` restored a working `npm 11.x`. Ten minutes of environment archaeology before a single line of code.

## M1 — Odds scoring + Tracker (~20 min)

**Built:** `score.ts` (odds score, blend, tier assignment), `Tracker.tsx` with `StatusBadge` + funnel counts + interview rate, `PostingCard.tsx` with odds badges. Fully working on demo data with **no AI anywhere**.

**Decisions & nuances:**
- Odds score is **log-scaled**, not linear: `applications/openings` ratios in the wild span 4→400, and a linear map crushes everything interesting into the bottom decile. `ratio 2 → 100, ratio 500 → 0` on a log10 scale gives: 18 apps/4 openings → 85 (🟢), 96/5 → 59 (🟡), 212/2 → 28 (🔴), 388/1 → 5. Missing counts → neutral 50 with a distinct ⚪ "no count data" badge (unknown ≠ bad).
- **Tiers are assigned in TypeScript by rank quantile (top 10% S, next 25% A, next 40% B, rest C), never by the LLM.** Two reasons: (1) LLMs grade-inflate — ask one to tier things and you get 80% A/S; quantiles guarantee a well-shaped distribution; (2) the final score blends numbers the LLM never sees (deterministic odds, embedding similarity), so letting it pick tiers would let it override signals it has no access to. The LLM judges *fit only*; arithmetic does the rest.
- Blend weights 0.55 fit / 0.25 odds / 0.20 sim, with the sim weight **redistributed proportionally** when embeddings aren't loaded (`0.6875/0.3125`) — so the app degrades gracefully instead of silently scoring everyone lower.

## M2 — BYOK + LLM parsing (~35 min, including a mid-build pivot)

**Built:** `storage.ts`, `SettingsModal` (provider picker + key, localStorage only), `llm.ts` (`chatJSON` chokepoint for Gemini + Groq), `parse.ts` (LLM extraction + three deterministic fast paths), `PasteImport` with "Parse as postings" / "Parse as My Applications" buttons.

**Decisions & nuances:**
- Single `chatJSON<T>(system, user, schema)` chokepoint: Gemini gets `responseMimeType: application/json` + `responseSchema`; Groq gets `response_format: {type:"json_object"}` with the schema embedded in the system prompt. All hardening (markdown fence stripping, JSON salvage between first `{`/`[` and last `}`/`]`, one parse-failure retry with a "Return ONLY valid JSON" nudge, one 429/5xx retry with backoff) lives in this one file.
- **Gotcha: Groq's `json_object` mode requires an *object* root** — a bare top-level array is rejected. All schemas are therefore wrapped as `{ items: [...] }`. This also stays inside Gemini's `responseSchema` keyword subset (`type/properties/items/required/nullable/enum/description` — no `additionalProperties`).
- Gemini key goes in the `x-goog-api-key` header rather than the documented `?key=` query param — same CORS behavior, but keys don't end up in URL/history/log lines.
- Regex backfill for the two numbers the entire ranking depends on (`/(\d[\d,]*)\s*applications?/i`, plus *both* orderings for openings: "Number of Job Openings 2" and "2 openings") — if the LLM returns null but the regex hits the posting's raw segment, the regex wins. Never trust an LLM with load-bearing numbers.
- Chunking: pastes >12k chars split on `Job ID` boundaries and greedily repacked; each extracted posting is matched back to its raw segment (by Job ID, then title substring) so embeddings and backfill operate on per-posting text.

**Mid-build pivot (the best 20 minutes of the project):** a *real* "My Applications" export landed to validate against, and it broke two assumptions:

1. **The paste is not TSV.** Copying the table produces a line-based format: nav junk, then column headers each followed by a `swap_vert` sort-icon line (columns: Job Title, Job ID, Term, Organization, App Status, Job Status, Division, Location, City, Openings, App Deadline, App Submitted On, App Submitted By), then records delimited by `print` lines (sometimes preceded by `preview`), **one field per line in column order**. Wrote a second deterministic fast path for this format. The subtle killer: **empty fields appear as blank lines**, so the parser must preserve line positions and read *exactly N lines per record* — the natural instinct to filter empty lines shifts every subsequent column over by one (found via a row whose Location was empty and whose City would have silently become its Location). A `/^\d+$/` check on the Job ID column rejects footer junk. Result: **45/45 real rows parsed with zero LLM tokens**, validated in a Node test harness against the real export.
2. **"App Status" and "Job Status" are two different columns.** App Status is *your* pipeline state (Applied / Employed / Application Withdrawn…); Job Status is the *posting's* state (Filled / Part Filled / Cancel / Stalled / "Expired - Apps Available"). Added `jobStatus` to the data model and tracker table — knowing a job you applied to was cancelled is genuinely useful signal the original design missed.
3. Free bonus found in the header: "You have submitted N of 500 applications for the current recruiting term." — one regex, now displayed atop the tracker.

- Testing nuance: Node 24's native TypeScript type-stripping ran the parser tests directly (no vitest/jest dependency added), but Node ESM requires explicit `.ts` extensions on relative imports, which the Vite `bundler`-resolution source doesn't have — worked around by staging stubbed copies in `/tmp`. Real personal data never entered the repo (`*.rtf` gitignored; demo data is fully fictional).

## M3 — Agent pipeline + tier list (~25 min)

**Built:** `agent.ts` (analyze pipeline), `PreferencesBar`, `TierList` with S/A/B/C rows, flags + rationale on cards.

**Decisions & nuances:**
- Deliberately **not** open-ended tool-calling agent loops: a fixed perceive → extract → judge → synthesize pipeline. One batched LLM call analyzes *all* postings at once (each compacted to ~300 chars of summary/skills) — the whole session costs 2–3 LLM calls total, which matters on a 10–15 RPM free tier. An unbounded agent loop is also un-debuggable in a 2-hour build.
- Postings are matched back to analyses by echoed `postingId`, with a positional fallback when the model garbles ids but returns the right count. Fit scores are clamped to 0–100 in TS; flags truncated to 3; a missing analysis degrades to fit=50 with a visible "no rationale returned" string rather than crashing.
- `reblend()` exists as a pure function so that when embeddings finish loading *after* an analysis already ran, simScores fold into finalScore and tiers reshuffle **without another LLM call**.

## M4 — Embeddings + similarity map (~30 min)

**Built:** `embeddings.ts` (lazy singleton MiniLM pipeline), `cluster.ts` (hand-rolled PCA + k-means), `SimilarityMap.tsx` (SVG scatter with cluster colors, tier rings, hover tooltips, download progress bar).

**Decisions & nuances:**
- transformers.js config: `Xenova/all-MiniLM-L6-v2`, `dtype: "q8"` (~25 MB download vs ~90 MB fp32 — quality loss is irrelevant for coarse similarity), `pooling: "mean", normalize: true` so cosine similarity is just a dot product. `device: "webgpu"` with a `.catch` fallback that re-instantiates on `wasm` — Safari and older Chrome land there automatically, and at ≤50 postings × 384 dims WASM is fast enough that the fallback is genuinely invisible.
- **Bundle-size fix (real issue):** statically importing `@huggingface/transformers` dragged ~850 kB of JS into the main chunk (1.09 MB total). Switched to a dynamic `import()` *inside* `getExtractor()` — main bundle dropped to 246 kB (78 kB gzip) and the library only loads when the Map tab is first opened, matching the lazy model download. The scary-looking 21.6 MB `ort-wasm` asset in `dist/` is only fetched at runtime if the WASM device is actually used.
- Progress bar sums `progress_callback` events **across files** (the model downloads as several files; naive per-event percentages jump around wildly).
- PCA is ~50 lines of power iteration: center, iterate `w ← XᵀXw` for the top component, deflate, repeat for the second. One subtle bug avoided: deflation mutates the centered rows in place, so final 2D projections must be recomputed from the *original* vectors. Init vector is a deterministic hash-ish sequence rather than `Math.random()` so the map layout is stable across re-renders. k-means uses deterministic stride init for the same reason; `k = min(4, ⌊n/3⌋)`.
- simScore normalization: raw MiniLM cosines between a short preference sentence and job postings cluster in a narrow band (~0.1–0.6), so absolute cosine×100 would compress the blend's sim term into noise. Min–max normalizing across the current batch spreads it to 0–100 — it's a *relative* ranking signal by construction.
- Tooltip positioning: the SVG uses a fixed viewBox and the wrapper div gets the same `aspect-ratio`, so percent-based absolute positioning of the HTML tooltip lines up with viewBox coordinates without any `getBoundingClientRect` math. Tooltip flips above/below the point depending on which half of the map it's in.

## M5 — Polish (~15 min)

**Built:** empty states for all three tabs, missing-key banner (explicitly says what still works without a key), header/tagline, footer privacy note, favicon (SVG), localStorage persistence of postings/applications/analyses/preferences/term-quota across reloads (cheap stretch #7), "Clear data" button, README, LICENSE, this log.

**Decisions & nuances:**
- Persistence is a single `useEffect` serializing to one `wingman.state` key with defensive parsing on load (every field falls back independently) — corrupt state degrades to empty, never crashes.
- The no-key path was treated as a first-class feature, not an error state: demo data + tracker + odds + (after model download) the similarity map all work with zero keys. Only paste-parsing of novel formats and fit-ranking require the LLM.
- `npm run build`: zero TS errors, main chunk 246 kB. Dev server smoke-tested headlessly (200s on `/`, transformed modules, favicon).

## Where the time actually went (~2.5 h wall clock)

| Phase | Time |
|---|---|
| Environment archaeology (npm shim) + scaffold | ~20 min |
| Score/tracker/cards (no AI) | ~20 min |
| BYOK + `chatJSON` + parse + schemas | ~35 min |
| Real-data pivot (line-block parser + jobStatus + validation harness) | ~25 min |
| Agent pipeline + tier list | ~20 min |
| Embeddings/PCA/k-means/map + bundle splitting | ~30 min |
| Polish, README, license, this log | ~15 min |

## Top learnings

1. **Validate against real data as early as you can get it.** The single most valuable event in the build was a real export invalidating the TSV assumption — the replacement line-block parser now handles real data deterministically, for free, and the "blank line = empty field" alignment bug would have been a nightmare to debug from user reports.
2. **Keep LLMs away from load-bearing numbers and final rankings.** Schema-constrained extraction is genuinely robust to messy input, but counts get regex backfill and tiers are quantile math. Every place the LLM's output is consumed has a typed, clamped, fallback-laden boundary.
3. **One JSON chokepoint** (`chatJSON`) made supporting two providers nearly free and gave a single place for every hardening trick. The `{items: [...]}` object-root wrapper is the kind of cross-provider quirk you only learn by supporting a second provider.
4. **Lazy-load by architecture, not by afterthought:** the dynamic `import()` boundary, the deferred model download, and the blend reweighting when sim is null were all designed together — the map is a pure enhancement layer that the app never waits for.
5. Tailwind v4 + Vite 8 + React 19 + Node-native TS stripping: the 2025 toolchain has quietly removed a whole category of config files.
