# RepoDoc AI

Generate professional documentation from any GitHub repository using Gemini AI. Paste a GitHub Personal Access Token, pick a repo, choose a doc type, and get streaming AI-generated output in seconds.

---

## Features

- **Three documentation types** — User Manual, Product Documentation, Architecture Docs
- **Interactive architecture diagram** — React Flow graph auto-extracted from your codebase
- **Streaming generation** — real-time output via Gemini 2.5 Flash / Pro
- **Post-processing pipeline** — strips hedges and artifacts, detects truncation, lints for missing sections
- **24h localStorage cache** — no re-generation on reload; age indicator shown
- **Demo mode** — try it without a token using a pre-generated Express.js example
- **Export to `.md`** — one-click markdown download

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 + Typography plugin |
| AI | Google Gemini 2.5 Flash + Pro |
| GitHub | Octokit REST |
| Diagram | React Flow + Dagre |
| Markdown | react-markdown + remark-gfm |
| Validation | Zod |

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/gelitogarcia/RepodocAI.git
cd RepodocAI/app
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
GITHUB_PAT=your_github_pat        # optional — enables auto-connect on launch
```

- **`GEMINI_API_KEY`** — get one at [aistudio.google.com](https://aistudio.google.com)
- **`GITHUB_PAT`** — optional server-side token. If omitted, users enter their own PAT on the landing page. Requires `repo` scope. [Create one here](https://github.com/settings/tokens/new?scopes=repo&description=RepoDoc+AI)

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

1. **Connect** — the app auto-connects if `GITHUB_PAT` is set in `.env`, otherwise enter your PAT on the landing page
2. **Select a repo** — search and pick from your GitHub repositories
3. **Choose a doc type** — User Manual, Product Documentation, or Architecture
4. **Generate** — Gemini streams the documentation in real time
5. **View** — switch between Preview, Markdown source, and (for Architecture) the interactive diagram
6. **Export** — download as `.md`

---

## App Structure

```
app/
├── app/
│   ├── page.tsx                  # Landing — auto-connect + PAT form + demo
│   ├── dashboard/page.tsx        # Repo selector + doc type picker
│   ├── preview/page.tsx          # Streaming preview + lint banners + diagram
│   └── api/
│       ├── repos/route.ts        # GitHub repo list
│       ├── generate/route.ts     # Gemini streaming generation
│       └── graph/route.ts        # Architecture graph extraction
├── components/
│   └── ArchitectureGraph.tsx     # React Flow + Dagre diagram
└── lib/
    ├── github.ts                 # Octokit helpers + file context builder
    ├── gemini.ts                 # Prompts, streaming, graph extraction + Zod validation
    ├── cache.ts                  # localStorage TTL cache
    └── postprocess.ts            # Artifact stripping, lint, truncation detection
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `GITHUB_PAT` | No | Server-side GitHub PAT for auto-connect |

---

## Deployment

Deploy to Vercel in one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/gelitogarcia/RepodocAI)

Set `GEMINI_API_KEY` (and optionally `GITHUB_PAT`) in your Vercel project environment variables.

---

## Demo

No token needed — click **"Try with demo repo"** on the landing page to see a pre-generated architecture breakdown of `expressjs/express` with interactive diagram.
