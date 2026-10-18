# MapTree
Indented outline -> connected flow diagram. Next.js 14 · TypeScript · React Flow · dagre · Tailwind. No account, no database.

```bash
npm install
npm run dev      # http://localhost:3000  (loads the RCS example already built)
npm test         # outline parser + graph validation (vitest)
```

## How it works
Paste an outline and press **Build diagram** (Ctrl+Enter). It works offline, instantly, with no AI key:
- Each top-level line (or the children of a single title line) becomes **one card**; its sub-lines are the card's subtitle.
- Cards are joined **in order**. First = start, last = end, validation-style titles (validate / verify / check / approve...) are red "check" cards.
- A step like *"On error switch to next provider"* / *"retry 3 times"* becomes a **Yes/No decision** after its stage; **No** loops back (dashed, left side) to the nearest routing/selection stage.
- A step like *"Update platform with status"* that names an earlier stage becomes a **dashed feedback arrow** (right side) to it. Feedback is not a loop and is ignored by validation.
- Everything is editable: drag from a card edge to connect, select a card or arrow to rename / retype / relabel / reverse / delete. Undo/redo, tidy layout, dark mode, export JSON / Mermaid, import JSON.

**Build with AI** (optional) is for plain sentences that have no indentation. Put `GROQ_API_KEY` in `.env.local` (or paste it under the gear icon). The AI result goes through the same validation, with one automatic repair pass.

## Files
- `src/lib/outline.ts` outline -> graph (all the rules above) · `src/lib/graph.ts` types, validation, Mermaid · `src/lib/layout.ts` dagre column · `src/lib/schema.ts` zod schema for AI/imported graphs
- `src/components/Editor.tsx` canvas + panels · `src/app/api/generate/route.ts` optional Groq call

## v4
- Views (top-left): Flow ↓, Flow →, Tree, Mind map, Loop. Card styles: Classic, Workflow, Detail.
- "Read as": Auto / Process / Hierarchy. Plain indented lists without process verbs become a hierarchy (tree / mind map).
- SRS button (top-right) writes a numbered requirements document from the diagram. Select a connection → "Insert a step here".
- Set `GROQ_MODEL` in `.env.local` (default `openai/gpt-oss-120b`); restart `npm run dev` after editing it.

## v5 (functional requirements pass)
- **Schema v1** (`src/lib/schema.ts`): versioned; typed relationships (`flow, feedback, contains, member, authorizes, depends, data`); every element has `prov` (stated / inferred / assumed) and `src` (verbatim source quote, verified server-side).
- **Refinement** (`/api/refine`, `src/lib/patch.ts`): type an instruction → AI proposes small structured changes → preview → Apply (undoable). Atomic, validated, max 2 model calls; on any failure the diagram is untouched.
- **Review:** assumed elements are dashed; accept (→ stated) or reject (removes). AI-reported conflicts are listed with both quotes.
- **Export:** PNG, SVG, JSON (versioned, includes conflicts), Mermaid. Header shows Saved / Not saved / Processing.
- Source text and graph text are fenced as data in prompts; keep the Groq key in `.env.local` for production.
- `npm install` (adds `html-to-image`), then `npm test`.

## v5.1 (retries, returns and loops)
- Return/retry paths are edges to EXISTING nodes. `repairGraph` (src/lib/repair.ts) replaces a "Return to X" copy with an edge to X when X matches exactly one node; several matches become an open question. Unspecified outcomes become **open questions**, never invented edges.
- Schema (compatible): optional `max` on a decision (stated attempt limit) and graph-level `questions`. Edge labels carry conditions; "return/retry" stays derived from graph shape.
- Validation: only `flow` edges are process steps (structural cycles are legal); loops need a labelled exit; retry loops without a stated limit warn; duplicate connections error; "Return to X" copies warn.
- Layout: return edges get separate lanes. Saved projects from `maptree:v3` are still loaded.
- Pure AI-output handling is in `src/lib/accept.ts` and tested with mocked answers (`tests/loops.test.ts`).
