# WaterlooWorks Wingman <img width="10" height="10" alt="image" src="https://github.com/user-attachments/assets/112364ba-0828-4fef-8ac3-303a179ac6f3" />

**Live demo: [waterlooworks-wingman.vercel.app](https://waterlooworks-wingman.vercel.app)** (click "Load demo data", no key needed)

A privacy-first copilot for UWaterloo co-op applications. Paste your WaterlooWorks postings and your "My Applications" page, and Wingman turns them into a real application tracker, an odds score for every posting, and a ranked shortlist that matches what you actually want. There is no backend, no scraping, and no login. Your data stays in your browser, and the AI runs on your own free-tier key.

## Why this exists

WaterlooWorks is rough. The Applied To view is such a weak tracker that students keep jobs on their Short List just to check statuses. Postings tell you "212 applications, 2 openings" and then give you nothing to do with that number. And after your fortieth wall-of-text posting in one sitting, they all blur together. Wingman fixes the parts that hurt the most.

## Features

- **Application tracker.** Paste your "My Applications" page and get a dashboard with status badges, the job's own status (Filled, Part Filled, Cancel, Stalled), funnel counts, your interview rate, and your "N of 500 applications" term quota. Real exports parse through a deterministic fast path, so no LLM tokens are spent on them.
- **Competition odds.** Every posting gets an odds score from its applications-per-opening ratio, badged 🟢 good odds, 🟡 competitive, or 🔴 long shot. These numbers come from regex and arithmetic, not the AI, so they can't be fudged.
- **Preference-based tier list.** Describe what you want in plain English, like "remote or Toronto, React/TypeScript, small product teams, $30+/hr". Batched LLM calls (about 25 postings each) judge fit for every posting, then plain TypeScript blends fit, odds, and semantic similarity and assigns S/A/B/C tiers by rank quantile.
- **Red and green flags.** Each card surfaces up to three green and three red signals plus a one-line rationale, so the important details stop hiding in the posting text.
- **Similarity map.** An on-device transformer (MiniLM via transformers.js, WebGPU with a WASM fallback) embeds every posting, then hand-rolled PCA and k-means lay your job landscape out as a scatter plot with cluster colors and tier rings.
- **Zero backend.** Parsing, embedding, clustering, and rendering all happen in the tab. The only network calls are the LLM calls you make with your own key.
- **Demo mode.** "Load demo data" ships 10 realistic postings and 8 applications, so everything works before you paste anything or add a key.

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

Open the printed localhost URL and click **Load demo data**. The tracker and odds scoring work with no API key at all.

### Bring your own key (for parsing real pastes and AI ranking)

1. Grab a free key from either provider:
   - **Gemini** (recommended): [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - **Groq** (Llama 3.3): [console.groq.com/keys](https://console.groq.com/keys)
2. Click **⚙️ Settings** in the app, pick your provider, paste the key, save.

The key lives in your browser's localStorage and is only ever sent to the provider you chose.

### Using it with real WaterlooWorks data

- **Postings:** open postings (detail pages or list view), select all, copy, paste into the import box, and hit **Parse as postings**. Messy formatting, nav junk, and multiple postings in one paste are all fine. The LLM extraction doesn't care about format, and a regex backfill catches the applications and openings counts.
- **My Applications:** select all and copy the Applications table page, paste, and hit **Parse as My Applications**. Real exports are recognized and parsed deterministically, no LLM call needed.

## Deploy

It builds to a fully static site: `npm run build` emits `dist/`.

- **Vercel:** run `vercel` (framework preset: Vite), or import the repo with build command `npm run build` and output `dist`.
- **Netlify:** build command `npm run build`, publish directory `dist`.
- **GitHub Pages:** build, then push `dist/` to a `gh-pages` branch. Set `base` in `vite.config.ts` if you serve from a subpath.

## Privacy

Everything is client-side. Parsed postings, applications, preferences, and your API key live in localStorage only. Posting text leaves the browser solely in the LLM calls you make with your own key, straight to Google or Groq. The embedding model runs entirely on-device. No server, no analytics, no tracking.

## Tech stack

- [Vite](https://vite.dev) + [React](https://react.dev) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite`
- [transformers.js](https://huggingface.co/docs/transformers.js) running `Xenova/all-MiniLM-L6-v2` embeddings, WebGPU with WASM fallback, lazy-loaded (about 25 MB quantized, cached after the first download)
- BYOK LLM: Gemini 2.0 Flash (JSON `responseSchema`) or Groq `llama-3.3-70b-versatile` (`json_object`), called over REST from the browser
- Hand-rolled PCA (power iteration), k-means, and an SVG scatter. No chart library, no router, no state library.

## License

[MIT](./LICENSE) © Angela Zhuang
