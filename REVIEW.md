# Code review — WaterlooWorks Wingman

Reviewer: pragmatic-code-reviewer (subagent) · Scope: all of `src/` (17 files, ~2,735 LOC), PLAN.md + BUILDLOG.md as spec context.
Method: full read of every source file, `npm run build` (passes — Nix npm per BUILDLOG M0), plus Node harnesses in `/tmp/ww-review` validating: truncated-JSON salvage behavior, TSV/line-block fast-path edge cases (0/1 rows, missing columns), chunking losslessness, and PCA/k-means at n=0/1/2, k>n, and all-identical vectors.

## Verdict

**Approve with changes recommended before real-data use at scale.** The end-to-end demo flow (demo load / paste → parse → tracker → rank → tier list → map) is sound at demo scale (~10–30 postings): error paths surface to the UI, id plumbing between postings/analyses/map points is consistent, the persistence round-trip is defensive, and the cluster math is NaN-safe at every edge I threw at it. But the single unbatched "analyze" call **reliably breaks the core ranking flow at the app's own stated scale** (100+ postings), and two network-robustness gaps (no fetch timeout; permanently cached failed model download) turn realistic flaky-network events into stuck-until-reload states.

**Counts: 1 P0 · 4 P1 · 6 P2.**

## Findings table

| # | Pri | Location | Issue |
|---|-----|----------|-------|
| 1 | P0 | `src/lib/agent.ts:68-83` | Batched analyze call is unbatched — breaks "Rank my jobs" at ~70+ postings (Gemini) / ~30+ (Groq) |
| 2 | P1 | `src/lib/llm.ts:131-160` | No fetch timeout — a hung connection wedges "Parsing…"/"Ranking…" forever |
| 3 | P1 | `src/lib/embeddings.ts:27-66` | Failed model download caches a rejected promise forever; retry impossible without a full page reload |
| 4 | P1 | `src/lib/parse.ts:381-401` | Multi-chunk extraction is all-or-nothing; mid-loop 429 discards every already-parsed chunk |
| 5 | P1 | `src/components/SimilarityMap.tsx:53-57` + `src/lib/embeddings.ts:73-82` | All postings embedded in one forward pass, recomputed on every Map visit — multi-second main-thread freeze / memory spike at 100+ on WASM |
| 6 | P2 | `src/App.tsx:85-93` | Stale `simScores` closure in `handleRank` — sim silently dropped from a rank that races the embedding load |
| 7 | P2 | `src/App.tsx:52-59` | Full-state `saveState` runs on every preference keystroke — synchronous ~0.5–1 MB stringify+write at 100+ postings |
| 8 | P2 | `src/lib/parse.ts:437-443` | List-view pastes (no "Job ID" boundaries): shared `raw` gives wrong regex-backfilled counts and a degenerate one-dot map |
| 9 | P2 | `src/lib/storage.ts:26-31` + `src/components/SettingsModal.tsx` | Single key slot shared across providers; no key validation until first real call |
| 10 | P2 | `src/lib/embeddings.ts:31-43` | Progress callback registered by first caller only — re-entering Map mid-download shows a frozen 0% bar |
| 11 | P2 | `src/lib/parse.ts:135,146` | TSV fast path: `/status/i` fallback grabs "Job Status" as App Status; rows without a Job ID get fresh `uid()`s so re-pastes duplicate tracker rows |

---

## Details

### 1. P0 — `analyze()` sends all postings in one LLM call; output truncates and the whole rank fails
`src/lib/agent.ts:68-83` (`analyze`), `src/lib/llm.ts:163-181` (`parseJsonLoose`)

**What breaks:** "Rank my jobs" — the core M3 feature — fails outright above roughly 70–90 postings on Gemini and ~30+ on Groq.

**Why:**
- `compact()` yields ~100–190 tokens/posting; the response needs ~90–120 tokens/item (rationale + flags + JSON overhead). Gemini 2.0 Flash caps output at **8,192 tokens** (no `maxOutputTokens` is set, but 8,192 is the model max) → the `items` array is cut mid-string at ~70–90 postings.
- Verified in a harness: `parseJsonLoose` **cannot salvage a truncated array** — the first-`{`/last-`}` slice still ends mid-item and `JSON.parse` throws. `chatJSON`'s single retry re-sends the identical request and truncates identically. The user then sees a raw `SyntaxError` message ("Expected ',' or ']' after array element…") in the PreferencesBar, not a friendly error.
- On Groq, the ~15–20k-token input at 100 postings exceeds the free-tier TPM limit (~6k for llama-3.3-70b) → the request is rejected before output truncation even matters, and `postWithRetry` treats 413 as non-retryable.

**Trigger:** paste 100+ postings (the task's own stated realistic browse volume), click "Rank my jobs". Deterministic failure.

**Fix sketch:** chunk `postings` into batches of ~25 inside `analyze()`, one `chatJSON` per batch (sequential), concatenate the per-batch analyses, and call the existing `retier()` once at the end. All the pieces (per-posting matching, `retier`) already exist; this is a ~10-line loop.

### 2. P1 — no fetch timeout: a hung connection wedges the UI until reload
`src/lib/llm.ts:131-160` (`postWithRetry`)

**What breaks:** on a stalled connection (campus Wi-Fi, provider brownout — the response never arrives, no error fires), the `fetch` hangs indefinitely. `PasteImport` keeps `busy` set (both parse buttons disabled, "Parsing…") and `PreferencesBar` keeps `ranking` — there is no way to recover except reloading the page.

**Fix sketch:** `fetch(url, { method: 'POST', signal: AbortSignal.timeout(60_000), ...init })` and map the `TimeoutError`/`AbortError` to an `LLMError('Request timed out — try again')`. One line plus a catch clause.

### 3. P1 — failed embedding-model download is cached as a rejected promise forever
`src/lib/embeddings.ts:27-66` (`getExtractor`)

**What breaks:** `extractorPromise` is set once and never cleared. If the ~25 MB download fails partway (flaky network — exactly the risk PLAN §9 calls out), the promise settles rejected and **every** subsequent `getExtractor()` call — including remounting the Map tab — instantly re-throws the same stale error. The WebGPU→WASM `.catch` fallback doesn't help: if the WASM attempt's download also fails, the whole chain is rejected permanently. Only a full page reload resets the module.

**Trigger:** open Map tab on a flaky connection, download dies at 60% → Map shows the error state forever, even after the network recovers.

**Fix sketch:** append `.catch((e) => { extractorPromise = null; throw e; })` to the chain assigned to `extractorPromise` (and don't set `ready`). Re-entering the Map tab then genuinely retries. A "Retry" button in the `status === 'error'` block of `SimilarityMap.tsx:141-145` would make the recovery discoverable, but the promise reset is the essential part.

### 4. P1 — multi-chunk posting extraction throws away all completed chunks on one failure
`src/lib/parse.ts:381-401` (`extractPostings` chunk loop)

**What breaks:** a 150-posting paste (~100k+ chars) splits into ~9–12 chunks → 9–12 sequential `chatJSON` calls (18–24 requests if parse-retries fire) against Gemini's free-tier 10–15 RPM. `postWithRetry` retries a 429 exactly once with a ~2 s backoff; a second 429 (likely mid-loop at this call rate) throws, and the `all` accumulator with every successfully parsed chunk is discarded. The user's paste text survives (cleared only on success), but retrying restarts from chunk 0 and burns more quota — a plausible livelock on free tier.

**Fix sketch:** wrap the per-chunk `chatJSON` in try/catch; on failure `break` and return the partial `all`, surfacing "parsed N postings; M chunks failed (rate limit) — paste the rest again in a minute" via the existing `PasteImport` message path. Optionally add a small inter-chunk delay (~4 s) to stay under RPM.

### 5. P1 — one-shot embedding of all postings: main-thread freeze + memory spike at 100+, recomputed on every Map visit
`src/components/SimilarityMap.tsx:53-57`, `src/lib/embeddings.ts:73-82` (`embed`)

**What breaks:** `embed(inputs)` runs a **single** forward pass over all texts. At 100–150 postings × ~300 padded tokens on the WASM fallback (Safari, older Chrome — the exact fallback the design promises), that's hundreds of MB of transient attention buffers (≈ batch × 12 heads × seq² × 4 B ≈ 430 MB+ at n=100) and a synchronous main-thread compute of many seconds to tens of seconds — the tab freezes with the progress bar stuck (progress only tracks the download, not inference). Worse, because `SimilarityMap` unmounts on tab switch and nothing caches vectors, **every visit to the Map tab redoes the full embedding pass**.

**Fix sketch:** loop `embed` in mini-batches of ~8–16 texts (`for` loop with `await` per batch), reporting progress between batches — bounds peak memory and lets the UI paint. Cheap add-on: cache the vectors in a module-level `Map<postingId, Float32Array>` keyed by posting id so tab revisits are instant.

### 6. P2 — stale `simScores` closure in `handleRank`
`src/App.tsx:85-93`

**What breaks:** `handleRank` captures `simScores` at click time. If the user starts a rank, then the Map-tab embedding pass completes while `analyze()` is in flight, `handleSimScores` reblends the (still-empty) analyses, and then `setAnalyses(result)` lands with `simScore: null` baked in — the fresh sim signal is silently dropped from the blend (weights redistribute, cards show `sim –`). It self-heals only when the user revisits the Map tab (triggering a full re-embed, see #5).

**Fix sketch:** mirror `simScores` into a `useRef` and, in `handleRank`, do `setAnalyses(simRef.current ? reblend(result, simRef.current) : result)`.

### 7. P2 — persistence effect stringifies the entire state on every preference keystroke
`src/App.tsx:52-59`

**What breaks:** `prefText` is in the deps of the `saveState` effect, so each keystroke in the preferences input synchronously `JSON.stringify`s all postings (including every full `raw` segment — ~0.5–1 MB at 100–150 detail-page postings) and writes to localStorage. Perceptible typing lag at scale; also each write races the 5 MB quota silently (`saveState` swallows the exception — acceptable, but persistence just quietly stops).

**Fix sketch:** debounce the effect (setTimeout ~500 ms with cleanup). Quota math note: at the realistic ≤150 postings (~1.2 MB) the 5 MB quota holds; no further action needed there.

### 8. P2 — list-view pastes share one `raw` across all postings: wrong backfilled counts + degenerate map
`src/lib/parse.ts:437-443` (`sanitizePosting` raw fallback), `src/lib/parse.ts:71-77` (`splitPostingSegments`)

**What breaks:** when a paste has no `Job ID` markers (WaterlooWorks *list-view* copy — explicitly invited by the PasteImport placeholder), `splitPostingSegments` returns a single segment, so every posting gets `raw =` the whole chunk. Two consequences, both verified in harnesses: (a) `extractCounts` is first-match-wins, so any posting whose counts the LLM returned as null is backfilled with the **first** posting's applications/openings — wrong odds badges and a wrong odds term in the blend; (b) all postings embed identically → simScores flatten to 50 and the map collapses every point to the center (no NaN, but useless).

**Fix sketch:** when `segments.length === 1 && items.length > 1`, skip regex backfill (leave null → neutral ⚪ badge) and build the embedding text from `compact(p)`-style fields instead of `raw`.

### 9. P2 — BYOK linking: one key slot for two providers, no validation until first real call
`src/lib/storage.ts:26-31`, `src/components/SettingsModal.tsx:16-21`

**What breaks (coherence, not crashes):** the key is stored in a single `wingman.apiKey` slot. Switching provider Gemini→Groq keeps the Gemini key; the user's next parse/rank fails with a 401. The error message is actually good ("Provider rejected the request (401). Check your API key in Settings.") and `chatJSON` reads provider+key fresh per call so switches apply immediately — but there's no feedback at save time, so a typo'd key is only discovered on the first real (quota-burning) call. Multi-tab and key-removal paths are coherent (checked).

**Fix sketch:** store keys per provider (`wingman.apiKey.${provider}` — ~4 lines in storage.ts), and/or fire a minimal `chatJSON('return {"ok":true}', …)` ping on Save with a ✓/✗ shown in the modal.

### 10. P2 — progress callback pinned to the first `getExtractor` caller
`src/lib/embeddings.ts:31-43`

**What breaks:** the singleton's `cb` closes over the `onProgress` from the **first** call. Leave the Map tab and return while the model is still downloading → the remounted component's `setProgress` is never registered, and the progress bar sits at 0% until completion.

**Fix sketch:** module-level `let currentOnProgress` that `getExtractor` reassigns on every call and `cb` reads through.

### 11. P2 — TSV fast-path quirks: Job Status misread as App Status; unstable ids duplicate on re-paste
`src/lib/parse.ts:135` (`col(/status/i)` fallback), `:146` (`uid()` fallback)

**What breaks:** (a) if the pasted table has a "Job Status" column but no "App Status", the `/status/i` fallback picks Job Status — verified: a row with `Job Status: Filled` renders an App Status badge "Filled" normalized to `other`. (b) TSV rows without a Job ID column get a fresh `uid()` per parse, so re-pasting the same table bypasses `mergeById` and duplicates every tracker row. (The line-block path is immune — it requires Job ID.)

**Fix sketch:** (a) fallback to `col(/^(app\s*)?status$/i)` or exclude `/job status/i`; (b) derive the fallback id from `title|organization` (stable hash) instead of `uid()`.

---

## What was checked and is fine (no action)

- **End-to-end id plumbing:** posting ids flow consistently into analyses (`postingId`), map points, and tier-list lookups; `mergeById` + "analyses cleared on new postings" keeps them in sync; persisted-state round-trip (`loadState`/`saveState`) is per-field defensive and survives corrupt JSON.
- **Error surfacing:** parse errors, missing-key, 4xx key rejection, and rank failures all reach visible UI state (`PasteImport.error`, `PreferencesBar.error`, Map error panel) — nothing is console-swallowed. Buttons are correctly disabled during in-flight work (no double-fire), `handleRank`'s throw is caught by `PreferencesBar`.
- **Cluster/PCA math at edges (harness-verified):** n=0/1/2, k>n (guarded by `k=min(k,n)`), all-identical vectors (no NaN; degenerate scaler centers points), empty-cluster reseed, deterministic init. `assignTiers` handles n=0 and guarantees ≥1 S.
- **Score math:** `oddsScore` handles 0 apps, null openings, ratio<1; `blendScores` reweighting when sim is null matches the documented 0.6875/0.3125 split; LLM outputs are clamped/typed at every boundary (`clampScore`, `strArray`, positional fallback in `analyze`).
- **Fast paths (harness-verified):** TSV 0-row/1-row, line-block single record, blank-line field preservation, footer rejection via `/^\d+$/`; `chunkPostingText` is lossless (char-preserving) and respects the 12k cap including the hardSplit path.
- **Build:** `tsc -b && vite build` passes clean; main chunk 246 kB, transformers.js correctly split out via dynamic import.
- **Trivial:** `embeddingsReady()` in `embeddings.ts:9` is exported but unused — delete when touching the file.
