# MapTree

Turn outlines, plain prose, or messy notes into interactive diagrams — with projects, version history, per-node notes, shareable links, and AI-assisted structuring and documentation.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. Everything works immediately with **no account and no API key** — AI features are the one part that needs setup (see below).

## Enabling AI features (Groq or xAI)

Three features call an AI backend: **AI Generate** (turn any messy text into a diagram), **AI: Suggest children** (fill gaps under a node), and **AI: SRS / PRD document** export. All three run through server-side API routes so your key is never sent to the browser.

**Groq** (console.groq.com — fast inference hardware, has a free tier) and **Grok** (xAI's model, console.x.ai) are two different things that are easy to mix up. This project supports either:

1. Get a free key from https://console.groq.com/keys
2. Copy `.env.example` to `.env.local` and set `GROQ_API_KEY`
3. Restart `npm run dev`

If you'd rather use xAI's Grok instead, set `XAI_API_KEY` in the same file — if both keys are set, Groq is used.

Without a key, the rest of the app works fully — those three buttons will show a clear error instead of failing silently.

## Features

- **Multiple input formats** — tree characters, indentation, bullets, or plain sentences (auto-detected), plus `.txt`/`.md`/`.json` import and drag-and-drop
- **4 layouts** — tree, left-to-right, mind map, radial
- **AI Generate** — paste any messy text and have it restructured into a clean outline before drawing
- **AI: Suggest children** — for the selected node, ask AI for missing child items specific to that part of the tree
- **AI: SRS / PRD export** — generate a grounded Software Requirements Specification or Product Requirements Document from the current diagram, downloaded as Markdown
- **Projects** — save, open, duplicate, rename, and delete named diagrams; switch between them from the Projects panel
- **Version history** — a version is saved automatically each time you click Generate, plus a manual "Save version now"; restore any past version
- **Node notes** — pin short notes to any node (scoped to a saved project); nodes with notes show a small badge
- **Share links** — a "quick link" (whole diagram in the URL, works offline) or a "hosted link" (`/view/[id]`, short, read-only, good for sending to teammates or clients)
- **14 starter templates** across Engineering, Architecture, Product, and Business categories
- **Export** — PNG, SVG, copy-to-clipboard image, JSON, Markdown outline, Mermaid
- Undo/redo, search, presentation mode, light/dark theme, 4 color palettes, keyboard shortcuts (press `?`)

## Architecture notes (read before relying on this in production)

- **Everything except sharing is client-side.** Projects, version history, and notes live in the browser's `localStorage`, namespaced under `maptree:*`. They do not sync across devices or browsers. The data layer (`lib/store/local.ts`) is written as a small repository so swapping it for a real database is a contained change, not a rewrite.
- **Share links use the server's temp directory** (`lib/share/store.ts`), so they work out of the box with zero setup. On a normal long-running Node server (`npm run start`) this is durable for as long as the process and disk survive. **On stateless/serverless hosting (e.g. Vercel functions), the temp directory is ephemeral and links can disappear** — swap in a real database or KV store (e.g. Postgres, Redis, Vercel KV) before relying on shared links in that kind of deployment.
- **Node identity isn't stable across raw text edits.** Notes are keyed by a node's label path (e.g. `Project > Backend > API`) rather than an internal id, because typing directly in the outline reparses and reassigns ids. This means renaming a node's label — or one of its ancestors — detaches its existing notes. Editing via the node panel (Rename button) preserves ids and notes; typing the new label directly in the textarea does not.
- **AI quality depends on the configured model.** `GROQ_MODEL` can be configured in `.env.local` with a model currently available to your Groq account.
## What's still manual-review territory

- Rename/new-project naming currently uses the browser's native `prompt()` dialog — functional, but a dedicated inline form would feel more native.
- Node icons are chosen by keyword-matching emoji, not a real icon library — fine for content, but not a strict visual system.
- No automated tests.
- `npm run lint` isn't configured in this project.

## Stack

Next.js 15 (App Router, with API routes), React 19, TypeScript, `@xyflow/react`, `@dagrejs/dagre`, `html-to-image`. Montserrat for UI type, JetBrains Mono for the outline editor (kept monospace so tree characters stay aligned).
