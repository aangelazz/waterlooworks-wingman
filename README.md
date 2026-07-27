# WaterlooWorks Wingman 🪿

**A privacy-first copilot for UWaterloo co-op applications.** Paste your WaterlooWorks postings and "My Applications" page, and an in-browser AI agent parses them, tracks your application statuses, scores your realistic odds from applications-to-openings ratios, flags red/green signals, and ranks everything into an S/A/B/C tier list against your stated preferences — with an embedding-powered similarity map of the whole job landscape. No backend, no scraping, no login: your data stays in your browser, and the LLM runs on your own free-tier key.

## Features

- **📋 Application tracker** — paste your "My Applications" page → dashboard with normalized status badges, Job Status column (Filled / Part Filled / Cancel / Stalled), funnel counts (applied / interview stage / offers / rejected), interview rate, and your "N of 500 applications" term quota. Real WaterlooWorks exports parse **deterministically with zero LLM tokens** via a line-block fast path.
- **🎲 Competition-ratio odds** — every posting gets a deterministic odds score from its applications-per-opening ratio, badged 🟢 good odds / 🟡 competitive / 🔴 long shot. The AI can't fudge these numbers.
- **🏆 Preference-driven tier list** — describe what you want in plain English ("remote or Toronto, React/TypeScript, small product teams, $30+/hr") → one batched LLM call judges fit and flags per posting; pure TypeScript blends fit + odds + semantic similarity and assigns S/A/B/C tiers by rank quantile.
- **🚩 Red/green flag analysis** — each card surfaces up to 3 green and 3 red signals plus a one-line rationale, so walls of posting text stop hiding things.
- **🗺️ Similarity map** — an on-device transformer (MiniLM via transformers.js, WebGPU with WASM fallback) embeds every posting; hand-rolled PCA + k-means lay out the job landscape as an SVG scatter with cluster colors and tier rings.
- **🔒 Zero backend** — parsing, embedding, clustering, and rendering all happen in the tab. The only network calls are your own LLM API calls with your own key.
- **🧪 Demo mode** — "Load demo data" ships 10 realistic postings + 8 applications so everything works without pasting anything or adding a key.

## Screenshots

<!-- TODO: add screenshots -->
| Tracker | Tier list | Similarity map |
|---|---|---|
| _coming soon_ | _coming soon_ | _coming soon_ |

## Quickstart

```bash
npm install
npm run dev
```

Open the printed localhost URL. Click **Load demo data** to try everything instantly — the tracker and odds scoring work with no API key at all.

### Bring your own key (for parsing your real pastes + AI ranking)

1. Get a free key from either provider:
   - **Gemini** (recommended): [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - **Groq** (Llama 3.3): [console.groq.com/keys](https://console.groq.com/keys)
2. Click **⚙️ Settings** in the app, pick the provider, paste the key, save.

The key is stored only in your browser's localStorage and sent only to the provider you chose.

### Using it with real WaterlooWorks data

- **Postings:** open postings (detail pages or list view), select-all + copy, paste into the import box, hit **Parse as postings**. Messy formatting, nav junk, and multiple postings per paste are fine — the LLM extraction is format-agnostic, with regex backfill for the applications/openings counts.
- **My Applications:** select-all + copy the Applications table page, paste, hit **Parse as My Applications**. Real exports are recognized by a deterministic parser (no LLM call needed).

## Deploy

It's a fully static site — `npm run build` emits `dist/`.

- **Vercel:** `vercel` (framework preset: Vite), or import the repo — build command `npm run build`, output `dist`.
- **Netlify:** build command `npm run build`, publish directory `dist`.
- **GitHub Pages:** build, then push `dist/` to a `gh-pages` branch (set `base` in `vite.config.ts` if serving from a subpath).

## Privacy

Everything is client-side. Parsed postings, applications, preferences, and your API key live in `localStorage` only. Posting text leaves the browser solely in the LLM API calls you make with your own key, direct to Google/Groq. The embedding model runs entirely on-device. There is no server, no analytics, no tracking.

## Tech stack

- [Vite](https://vite.dev) + [React](https://react.dev) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com) (via `@tailwindcss/vite`)
- [transformers.js](https://huggingface.co/docs/transformers.js) — `Xenova/all-MiniLM-L6-v2` embeddings, WebGPU with WASM fallback, lazy-loaded (~25 MB quantized, cached)
- BYOK LLM: Gemini 2.0 Flash (JSON `responseSchema`) or Groq `llama-3.3-70b-versatile` (`json_object`), called via REST from the browser
- Hand-rolled PCA (power iteration) + k-means + SVG scatter — no chart library, no router, no state library

## License

[MIT](./LICENSE) © Angela Zhuang
