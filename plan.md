# RepoDoc AI — Hackathon Project Plan

## Overview

A web app that connects to a GitHub repository and uses Gemini AI to automatically generate three types of documentation **plus** an interactive architecture diagram. Users connect via a GitHub PAT (manual input or server-side env var), browse their repos, pick a doc type, and get streaming AI-generated output with a one-click export.

---

## Core Features (Built)

### 1. GitHub Integration
- Authenticate via GitHub Personal Access Token — manual input on landing page, or auto-connect from server-side `GITHUB_PAT` env var
- Browse and search all user repos (public + private)
- Pull repo tree, README, package.json, key source files, commit history
- Smart file selection: key config files + top 15 scored code files (truncated to fit context)

### 2. AI-Powered Documentation — Gemini 2.5
- Streamed responses (real-time generation feel)
- Structured prompts per doc type with role + output format instructions
- Flash for User Manual / Product Docs; Pro for Architecture + graph
- Content cached in `localStorage` with 24h TTL — no re-generation on reload
- ↺ Regenerate button to force a fresh generation
- Post-processing pipeline runs after each generation: strips hedges/artifacts, lints for truncation and missing sections

### 3. Documentation Types

#### User Manual
- Introduction, prerequisites, installation
- Step-by-step usage guide
- Configuration options, FAQ, contributing
- Anti-hedging rules + integration disambiguation injected into prompt

#### Product Documentation
- Features list (grouped by category), API reference table, data models
- Configuration reference (env var table), changelog, roadmap
- Hard section list with word-count floors; banned-words list; output contract
- Minimum 2500 words enforced via prompt

#### Architecture Documentation
- System overview, tech stack
- Folder structure explanation, key components
- Data flow, design patterns, external integrations
- Deployment architecture (inferred)

### 4. Interactive Architecture Diagram
- Exclusive to the Architecture doc type
- Second Gemini call extracts a structured JSON node/edge graph
- Rendered with **React Flow** + **Dagre** auto-layout
- LR layout by default (TB only for small linear graphs ≤6 nodes, max fan-out ≤2)
- Color-coded node types: service, database, frontend, external, queue, cache
- Animated edges, minimap, zoom/pan controls, description capped at 2 lines
- Loaded on-demand (doesn't block markdown generation)

### 5. Post-Processing Pipeline (`lib/postprocess.ts`)
- `stripArtifacts()` — removes `(inferred from X)` parentheticals, marketing phrases, safe hedge adverbs
- `lintDocument()` — flags truncation, missing required sections, empty tables, high hedge density, leaked reasoning
- `detectTruncation()` — unclosed code fences, bare table headers, no terminal punctuation
- Runs client-side after stream ends; cleans content before display
- Truncation banner with one-click Regenerate; collapsible quality notes panel

---

## Tech Stack

| Layer        | Technology                             |
|--------------|----------------------------------------|
| Framework    | Next.js 16 (App Router)                |
| Styling      | Tailwind CSS v4 + Typography plugin    |
| AI           | Google Gemini 2.5 Flash + 2.5 Pro      |
| GitHub       | Octokit REST                           |
| Diagram      | React Flow (@xyflow/react) + Dagre     |
| Markdown     | react-markdown + remark-gfm            |
| Validation   | Zod                                    |
| Export       | Native Blob download (.md)             |
| Hosting      | Vercel (ready)                         |

---

## App Flow

```
User → Landing page
  → Auto-connect (env GITHUB_PAT) OR manual PAT input
  → Validate token → Dashboard
  → Browse / search repos → Select repo
  → Choose doc type: [User Manual] [Product Docs] [Architecture]
  → Gemini streams markdown documentation
  → Post-process: strip artifacts → lint → show banners
  → View: Preview | Markdown | 🏗️ Diagram (architecture only)
  → Export as .md  |  ↺ Regenerate
```

---

## Pages / Screens

| Route        | Description                                                         |
|--------------|---------------------------------------------------------------------|
| `/`          | Landing — auto-connect or manual PAT form + demo button             |
| `/dashboard` | Repo browser (search + filter) + doc type picker                    |
| `/preview`   | Streaming markdown + lint banners + diagram tab + export            |

---

## API Routes

| Route            | Method | Auth source                            | Description                              |
|------------------|--------|----------------------------------------|------------------------------------------|
| `/api/repos`     | GET    | `x-github-token` header or env PAT     | List authenticated user's GitHub repos   |
| `/api/generate`  | POST   | `body.token` or env PAT                | Stream Gemini documentation generation   |
| `/api/graph`     | POST   | `body.token` or env PAT                | Extract JSON architecture graph          |

All routes fall back to `process.env.GITHUB_PAT` when no token is supplied by the client.

---

## File Structure

```
app/
├── app/
│   ├── page.tsx                  # Landing — auto-connect + manual PAT form + demo
│   ├── dashboard/page.tsx        # Repo selector + doc type picker
│   ├── preview/page.tsx          # Streaming preview + lint banners + diagram tab
│   └── api/
│       ├── repos/route.ts        # GitHub repo list (env PAT fallback)
│       ├── generate/route.ts     # Gemini streaming doc generation (env PAT fallback)
│       └── graph/route.ts        # Gemini architecture graph extraction (env PAT fallback)
├── components/
│   └── ArchitectureGraph.tsx     # React Flow + Dagre diagram (LR-default layout)
└── lib/
    ├── github.ts                 # Octokit helpers + priority file context builder
    ├── gemini.ts                 # Prompts, streaming, graph extraction + validation
    ├── cache.ts                  # localStorage TTL cache (24h)
    └── postprocess.ts            # Strip artifacts, lint, truncation detection
```

---

## MVP Scope — Status

- [x] GitHub PAT login (manual input form + env var auto-connect)
- [x] Repo tree + file fetcher + context builder
- [x] Generate all 3 doc types via Gemini (streaming)
- [x] Markdown preview (rendered + raw toggle)
- [x] Export to `.md`
- [x] Cache → `localStorage` with 24h TTL + age indicator
- [x] Regenerate button
- [x] Interactive architecture diagram (React Flow + Dagre)
- [x] Demo mode (pre-written content + simulated stream, no PAT needed)
- [x] PAT transparency (scope disclosure, sessionStorage note, token creation link)
- [x] AI disclaimer banner on preview page
- [x] Priority-based file selection (entry points, API routes, config first)
- [x] Model routing (Gemini Pro for architecture/graph, Flash for other docs)
- [x] Zod graph validation + retry + fallback
- [x] Improved graph prompt (SaaS detection, CI/tooling exclusion, few-shot example)
- [x] Dagre layout: LR-default for fan-out graphs, description line-clamp, better spacing
- [x] Post-processing pipeline (strip artifacts + lint + truncation detection)
- [x] Improved product-docs prompt (hard sections, banned words, 2500-word floor, output contract)
- [x] User manual prompt anti-hedging + integration disambiguation
- [x] Lint banners on preview (truncation + quality notes)
- [x] Disconnect button working (skips auto-reconnect via `?disconnected=1`)
- [x] Server-side env PAT fallback on all API routes

---

## Improvement Plan

---

### P0 — Critical ✅ All done

#### 1. Add a "Try Demo Repo" button on the landing page ✅
- Pre-written `expressjs/express` content baked into `preview/page.tsx` (`DEMO_CONTENT`, `DEMO_GRAPH`)
- `simulateStream()` chunks text into 30-char pieces at 12ms intervals
- Demo badge in header; no PAT required; triggered by `demo: true` flag in params

#### 2. Harden the architecture graph extraction ✅
- Zod schema: kebab-case id regex, label/description length limits, edge→node reference validation
- Retry once with error hint; fallback to minimal graph on both failures
- `pruneGraph()` keeps top 25 by degree when over limit

#### 3. ~~Ship "Commit docs to repo" as MVP~~ — Removed
- Removed: button, banners, state, `handleCommit`, and `/api/commit-docs` route.

#### 4. Make the PAT input scope-aware and transparent ✅
- GitHub token creation link pre-filled with `repo` scope
- sessionStorage-only storage, never sent server-side without user action

---

### P1 — High Priority ✅ All done

#### 5. Upgrade the file selection heuristic ✅
- `CONFIG_FILES` always included; `ENTRY_PATTERNS` + `API_ROUTE_PATTERNS` + depth-based scoring
- `stripComments()` per extension; 4k chars/file cap; top 15 code files

#### 6. Use Gemini 2.5 Pro for Architecture + graph extraction ✅
- `MODEL_FOR` map: Flash for user-manual/product-docs, Pro for architecture + graph

#### 7. Switch cache to `localStorage` with TTL ✅
- `lib/cache.ts`: `cacheSet/cacheGet/cacheDel/cacheAge`, 24h TTL
- "cached Xh ago" indicator shown on preview page

#### 8. Add disclaimers ✅
- AI disclaimer banner on `/preview`; truncation banner with regenerate CTA

---

### Graph Prompt & Layout Improvements ✅

#### Improved graph extraction prompt
- Explicit SaaS inclusion list across 14 categories
- Explicit exclusion list (CI/CD, Docker, linters, dev tooling, hosting providers)
- "Runtime architecture only" framing; `reasoning` field; few-shot e-commerce example
- Stricter Zod validation

#### Dagre + React Flow layout (current)
- LR layout by default; TB only for small narrow graphs (≤6 nodes, max fan-out ≤2)
- `ranksep: 180` (LR), `nodesep: 45` (LR) — services stack vertically, not horizontally
- `NODE_W=210`, `NODE_H=80`; description capped at 2 lines via `-webkit-line-clamp`
- `minZoom=0.15`, `maxZoom=2`, `fitViewOptions.padding=0.15`

---

### Prompt Quality & Post-Processing ✅

#### Improved Product Docs prompt
- Hard section list (7 sections) with word-count floors
- Banned words list: "typically", "usually", "may", "might", "inferred from", etc.
- Forbidden patterns: no `(inferred from X)`, no marketing copy, no UI claims without source
- Output contract: starts with `# {repo} Product Documentation`, dated footer, 2500-word minimum

#### User Manual prompt additions
- Anti-hedging block: confidence rules, no click-by-click UI descriptions without source
- Integration disambiguation: Dub = URL shortening (not SMS), SMS transport must be named

#### `lib/postprocess.ts`
- `stripArtifacts()`: leaked reasoning, marketing phrases, safe hedge adverbs, whitespace normalization
- `lintDocument()`: truncation, missing sections, empty tables, hedge density, leaked reasoning
- `detectTruncation()`: odd code fences, no terminal punctuation, bare table header
- `REQUIRED_SECTIONS` map per doc type exported alongside functions
- Runs client-side after stream completes; `setContent(result.cleaned)` replaces raw output

---

### P2 — Medium Priority (Pending)

#### 9. Add a lightweight history view
- `/history` route listing cached `repodoc:*` keys grouped by repo. Link from dashboard header.

#### 10. Stream simulation on cached loads
- Partially done (demo mode uses it). Cached real loads show content instantly — no stream feel.

#### 11. Prompt evaluation on a fixed test repo
- Pick one reference repo; after any prompt change, regenerate all 3 types and diff against snapshots.

---

### Cuts

- **Commit to repo / GitHub PR** — Removed. Extra scope, complexity, no demo value.
- **Settings page** — Removed (was left as empty directory causing build error; deleted).
- **Login page (NextAuth)** — Reverted. Replaced by simple PAT form on landing page.
- **Chat interface** — Rabbit hole. Cut.
- **Multi-repo comparison** — Unclear value prop. Cut.
- **`RepoContext` structured parsing** — Deferred; full context string embedded into prompts instead.

---

## Stretch Goals

- [ ] **Diff view when repo changes** — "Living documentation" narrative
- [ ] **"Explain this file" button** — Click any file in the repo tree, get a 1-paragraph explanation
- [ ] **Shareable read-only links** — Publish docs at a public URL
- [ ] **Export to PDF**
- [ ] **Auto-update docs on push** — GitHub App webhook; v2

---

## Risks Table

| Risk | Likelihood | Mitigation | Status |
|------|------------|------------|--------|
| Gemini rate-limit during demo | High | Demo mode with simulated stream, no API call | ✅ Done |
| Graph extraction returns malformed JSON | High | Zod validation + retry + fallback | ✅ Done |
| Judge asks about PAT security | Near-certain | Transparent disclosure on landing; sessionStorage only | ✅ Done |
| Gemini hallucinates APIs/functions | Certain | Disclaimer banner + lint quality notes | ✅ Done |
| Private repo content sent to Google | Real concern | User informed consent on landing | ✅ Done |
| File selection misses entry points | High on real repos | Priority scoring: entry > API routes > src > other | ✅ Done |
| Architecture diagram unreadable (fan-out) | Medium | LR layout by default; 25-node cap; degree pruning | ✅ Done |
| Edge labels overlap on fan-out nodes | Medium | Removed staggered labels; LR collapses fan-out vertically | ✅ Done |
| CI/Docker nodes polluting runtime diagram | Medium | Explicit exclusion list in graph prompt | ✅ Done |
| SaaS integrations missing from diagram | Medium | Explicit SaaS inclusion list with 14 categories | ✅ Done |
| Large repos exceed context window | High | Truncation + priority file selection | ✅ Done |
| Cache lost on tab close | Medium | localStorage with 24h TTL | ✅ Done |
| Generation truncates mid-content | Medium | `detectTruncation()` + banner + one-click regenerate | ✅ Done |
| Hedge/artifact-heavy output | Medium | `stripArtifacts()` + banned-words prompt + lint warning | ✅ Done |
| Disconnect loops back to dashboard | Fixed | `?disconnected=1` skips auto-connect on landing | ✅ Done |
| No env PAT configured | Common | Manual PAT input form on landing page | ✅ Done |
| Next.js 16 regression bugs | Low | Build passes clean; settings dir removed | ✅ Done |
