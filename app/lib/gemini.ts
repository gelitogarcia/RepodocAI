import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export type DocType = "user-manual" | "product-docs" | "architecture";

// P1 #6: Route by doc type — Pro for architecture, Flash for others
const MODEL_FOR: Record<DocType | "graph", string> = {
  "user-manual":  "gemini-2.5-flash",
  "product-docs": "gemini-2.5-flash",
  architecture:   "gemini-2.5-pro",
  graph:          "gemini-2.5-pro",
};

const PROMPTS: Record<DocType, (context: string, repoName: string) => string> = {
  "user-manual": (context, repoName) => `
You are a technical writer. Based on the following GitHub repository context, generate a comprehensive **User Manual** in Markdown.

Repository: ${repoName}

The user manual must include:
1. Introduction (what the app does, who it's for)
2. Prerequisites & Installation
3. Getting Started (quick start guide)
4. Core Features & How to Use Them (step-by-step)
5. Configuration Options
6. Troubleshooting / FAQ
7. Support & Contributing

Repository Context:
${context}

Write in clear, non-technical language. Use headers, bullet points, and code blocks where appropriate.

# Writing Rules

- Write with confidence. State facts directly.
- Do not use: "typically", "usually", "often", "may", "might", "could", "likely", "probably", "seems to", "tends to", "in most cases".
- Do not describe UI behavior click-by-click unless a specific component file in the provided context defines that UI. If you cannot see the UI, describe the feature at the config/code level and skip the clicks.
- Do not include marketing copy. No "Say goodbye to...", no "empower your...", no cheerful closers.
- Do not cite commits or files in prose. Do not write "(inferred from X)".
- Installation instructions: every command must be runnable exactly as written. If you are uncertain about a value, parameterize it (e.g., \`<YOUR_DB_PASSWORD>\`) rather than guessing.
- Troubleshooting entries: each must reference a specific, named failure mode. No generic "if something isn't working, check logs" entries.

# Integration Disambiguation

When describing integrations, use these rules:
- A dependency on \`dub\` or env vars starting with \`DUB_\` means the product uses Dub for URL shortening. Dub is NOT an SMS provider, email provider, or analytics tool.
- The actual SMS transport is whichever of Twilio, Vonage, MessageBird appears in deps/env. If none are present, say "No SMS transport is configured in the provided context."
- Only claim payment, analytics, and email providers that appear in deps/env (Stripe/Paddle, PostHog/Mixpanel, Resend/SendGrid/Postmark).
`,

  "product-docs": (context, repoName) => {
    const repo = repoName.split("/")[1] ?? repoName;
    const today = new Date().toISOString().slice(0, 10);
    return `
You are a senior technical writer creating end-user product documentation. You write with confidence and precision. You never hedge. You never show your reasoning. You never stop early.

# Task
Write complete Product Documentation for the repository below. This is a reference document a new user or integration partner would read to understand what the product does, what it exposes, and how to configure it.

Repository: ${repoName}

# Repository Context
${context}

# Required Sections (in this exact order, with these minimum word counts)

1. **Product Overview** (150–250 words)
   - One-sentence definition of what the product is.
   - Two-paragraph expansion covering: primary use case, who operates it, what it replaces or competes with.
   - End with the tech stack summarized in one sentence (languages, framework, DB).

2. **Features** (400–700 words, grouped into 3–6 categories)
   - Group features into logical categories (e.g., "Scheduling", "Integrations", "Admin").
   - Each feature: name in bold + one sentence describing what it does for the user.
   - No meta-commentary. No citations to commits or files.

3. **API Reference** (MINIMUM 5 endpoints, as a markdown table)
   - Columns: \`Method\`, \`Path\`, \`Description\`, \`Auth\`.
   - Derive from route files (e.g., \`app/api/**/route.ts\`, \`pages/api/**\`, \`routes/**\`).
   - If you cannot find 5 real endpoints in the context, write "No public API routes were found in the provided context." and move on.
   - Do not invent endpoints.

4. **Data Models** (at least 3 core entities)
   - For each: model name, 4–8 key fields with types, one-sentence purpose.
   - Pull from Prisma schema, SQLAlchemy models, TypeORM entities, or equivalent.
   - If no schema files are in the context, write "No data models were found in the provided context." and move on.

5. **Configuration** (reference table for all env vars)
   - Columns: \`Variable\`, \`Required?\`, \`Default\`, \`Purpose\`.
   - One row per unique env var. Group secrets separately with a "Secrets" subheading.

6. **Changelog** (grouped by type)
   - Parse recent commits. Group as: **Features**, **Fixes**, **Internal**.
   - One line per commit: \`[short SHA] Human-readable summary.\`
   - Translate technical commit messages into user-visible change descriptions.

7. **Roadmap**
   - ONLY include real roadmap content from TODO, ROADMAP, or similar files in the context.
   - If none exist, write exactly: "No roadmap information is published in this repository." Do not invent roadmap items.

# Banned Words and Phrases

Do not use any of these:
- "typically", "usually", "often", "generally", "normally", "in most cases"
- "may", "might", "could", "possibly", "perhaps", "likely", "probably"
- "seems to", "appears to", "tends to"
- "robust", "powerful", "seamless", "effortless", "best-in-class"
- "inferred from", "based on the commit", "as indicated by"

If you catch yourself hedging, either state the fact confidently or omit the sentence entirely.

# Forbidden Patterns

- No parentheticals citing commits or files as evidence. Write the fact directly.
- No "(inferred from X)", "(as seen in Y)", "(based on Z)".
- No apologies or meta-commentary.
- No marketing copy in the Overview.
- No claims about UI behavior unless a specific component file in the context defines it.

# Output Contract

- Output raw markdown only. No code-fence wrapping, no commentary, no intro paragraph before the doc.
- Start with \`# ${repo} Product Documentation\`.
- End with: \`---\n*Generated ${today} — verify against source before publishing.*\`
- Total length: minimum 2500 words. Do not stop short. If a section has no content, include the section header and a one-sentence "no data" note, then continue.

Generate the document now.
`.trim();
  },

  architecture: (context, repoName) => `
You are a software architect. Based on the following GitHub repository context, generate an **Architecture Documentation** in Markdown.

Repository: ${repoName}

The architecture documentation must include:
1. System Overview
2. Tech Stack (languages, frameworks, databases, infrastructure)
3. Folder Structure Explanation (what each folder/module is responsible for)
4. Key Components & Their Responsibilities
5. Data Flow Description
6. Design Patterns Used
7. External Integrations & Dependencies
8. Deployment Architecture (inferred)

Repository Context:
${context}

Include Mermaid.js diagrams where helpful (e.g., for data flow or component relationships).
`,
};

const NodeTypeEnum = z.enum(["service", "database", "frontend", "external", "queue", "cache"]);

const GraphSchema = z.object({
  reasoning: z.string().optional(),
  nodes: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    label: z.string().min(1).max(60),
    type: NodeTypeEnum,
    description: z.string().max(160).optional(),
  })).min(1).max(25),
  edges: z.array(z.object({
    id: z.string().optional(),
    source: z.string(),
    target: z.string(),
    label: z.string().max(40).optional(),
  })),
}).refine(
  (g) => {
    const ids = new Set(g.nodes.map((n) => n.id));
    return g.edges.every((e) => ids.has(e.source) && ids.has(e.target));
  },
  { message: "Edge references unknown node id" }
);

export type NodeType = z.infer<typeof NodeTypeEnum>;
export type GraphNode = z.infer<typeof GraphSchema>["nodes"][number];
export type GraphEdge = z.infer<typeof GraphSchema>["edges"][number] & { id: string };
export type ArchGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

const GRAPH_PROMPT = (context: string, repoName: string, errorHint?: string) => `
You are a senior software architect. Your job is to produce a clean, accurate runtime architecture diagram of a software system, derived only from the repository context provided.

You output strict JSON. No prose, no markdown, no code fences.
${errorHint ? `\nYour previous attempt failed validation with: ${errorHint}\nReturn ONLY valid JSON matching the schema.\n` : ""}
# Task
Extract the RUNTIME architecture of ${repoName} as a JSON graph.

Runtime architecture = the components that exist and communicate when the deployed app is actually serving users. It does NOT include build, CI/CD, testing, or developer tooling.

# What to Include (look for evidence of each)

1. **Frontends** — user-facing clients. Evidence: Next.js pages, React apps, mobile apps, CLI clients.
2. **Backend services** — API servers, background workers, microservices. Evidence: route handlers, server entrypoints, worker files.
3. **Databases** — persistent stores. Evidence: Prisma schema, SQLAlchemy models, Mongoose schemas, DATABASE_URL env vars, migration files.
4. **Caches** — Redis, Memcached. Evidence: \`redis\`, \`ioredis\` deps; REDIS_URL; cache middleware.
5. **Queues / background job systems** — Evidence: BullMQ, Celery, Sidekiq, SQS, Kafka, RabbitMQ, Temporal, Inngest, Trigger.dev. Look for \`queue\`, \`worker\`, \`job\` in dependencies or folders.
6. **External SaaS APIs** — runtime third-party services the app calls. Check dependencies and env vars for:
   - Payments: Stripe, Paddle, Lemon Squeezy, PayPal
   - Email: SendGrid, Postmark, Resend, Mailgun, SES, Nodemailer
   - SMS/Voice: Twilio, Vonage
   - Video: Daily, Zoom SDK, Twilio Video, Agora, LiveKit
   - Auth: Auth0, Clerk, WorkOS, Cognito, NextAuth providers
   - Analytics: PostHog, Mixpanel, Amplitude, Segment, Google Analytics
   - Storage: S3, Cloudflare R2, GCS, Uploadthing
   - AI/ML: OpenAI, Anthropic, Gemini, Replicate
   - Calendar: Google Calendar, Microsoft Graph, Cronofy
   - Search: Algolia, Meilisearch, Elasticsearch
   - Support: Intercom, Crisp, Zendesk
   - Maps: Mapbox, Google Maps
   - CMS: Sanity, Contentful, Strapi
   - Feature Flags: LaunchDarkly, GrowthBook, PostHog

# What to EXCLUDE

- GitHub Actions, CircleCI, Jenkins, Travis, or any CI system
- Docker, Docker Compose, Kubernetes manifests (packaging, not runtime)
- Linters, formatters, type checkers, test runners
- Local dev tooling: Vite dev server, nodemon, ts-node
- Package managers: npm, pnpm, yarn, pip
- Repository hosting: GitHub, GitLab (unless the app calls GitHub's API at runtime)
- Hosting providers (Vercel, Fly, Render, Railway) unless they provide a runtime service like Vercel KV/Postgres
- IDE or editor configs

# Node Types (strictly one of these six)

- \`frontend\`: user-facing client
- \`service\`: backend process, API server, worker
- \`database\`: persistent store
- \`cache\`: in-memory key-value store
- \`queue\`: message queue or job queue
- \`external\`: third-party SaaS / API the app calls

# Edge Direction Rules

Edges point in the direction of REQUEST or DATA FLOW:
- Browser → Backend (the browser calls the backend)
- Backend → Database (the backend queries the database)
- Backend → External SaaS (the backend calls Stripe, etc.)
- Producer → Queue → Consumer (separate edges)

# Other Rules

- Max 25 nodes. If you identify more, pick the 25 most architecturally significant.
- No duplicate nodes. Merge similar names into one.
- Node IDs: lowercase kebab-case (\`stripe-api\`, \`primary-postgres\`).
- Node labels: human-friendly title case (\`Stripe\`, \`Primary Postgres\`).
- Node descriptions: ONE sentence, max 100 chars. Cite the env var or dep that evidences it.
- Edge labels: ≤ 3 words if possible. Prefer verbs: "queries", "publishes", "sends", "authenticates via".

# Required Output Format (JSON only — no fences, no prose)

{
  "reasoning": "2-4 sentence summary of the architecture in plain English.",
  "nodes": [
    {
      "id": "kebab-case-id",
      "label": "Human Label",
      "type": "frontend|service|database|cache|queue|external",
      "description": "One sentence citing evidence."
    }
  ],
  "edges": [
    {
      "source": "kebab-case-id",
      "target": "kebab-case-id",
      "label": "verb phrase"
    }
  ]
}

# Example

{
  "reasoning": "Next.js storefront hits a tRPC API backed by Postgres. Stripe handles payments, Resend sends order emails, and a BullMQ worker processes fulfillment jobs via Redis.",
  "nodes": [
    { "id": "browser", "label": "Customer Browser", "type": "frontend", "description": "Next.js storefront rendered to end users." },
    { "id": "web-app", "label": "Next.js App", "type": "service", "description": "Monolith serving UI and tRPC API (app/api/*)." },
    { "id": "worker", "label": "Fulfillment Worker", "type": "service", "description": "BullMQ worker processing order jobs." },
    { "id": "postgres", "label": "Primary Postgres", "type": "database", "description": "Orders, users, products (DATABASE_URL)." },
    { "id": "redis", "label": "Redis", "type": "cache", "description": "Session cache and BullMQ backing store (REDIS_URL)." },
    { "id": "jobs-queue", "label": "Fulfillment Queue", "type": "queue", "description": "BullMQ queue for order processing." },
    { "id": "stripe", "label": "Stripe", "type": "external", "description": "Payment processing (STRIPE_SECRET_KEY)." },
    { "id": "resend", "label": "Resend", "type": "external", "description": "Transactional email (RESEND_API_KEY)." }
  ],
  "edges": [
    { "source": "browser", "target": "web-app", "label": "HTTPS" },
    { "source": "web-app", "target": "postgres", "label": "queries" },
    { "source": "web-app", "target": "redis", "label": "reads/writes" },
    { "source": "web-app", "target": "stripe", "label": "charges" },
    { "source": "web-app", "target": "jobs-queue", "label": "enqueues" },
    { "source": "jobs-queue", "target": "worker", "label": "delivers to" },
    { "source": "worker", "target": "postgres", "label": "updates" },
    { "source": "worker", "target": "resend", "label": "sends email" }
  ]
}

# Repository Context

${context}

Now analyze the repository and output ONLY the JSON. No prose before or after.
`.trim();

function buildFallbackGraph(repoName: string): ArchGraph {
  return {
    nodes: [
      { id: "repo", label: repoName, type: "service", description: "Repository root" },
    ],
    edges: [],
  };
}

function pruneGraph(graph: ArchGraph): ArchGraph {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // Remove edges referencing non-existent nodes
  const validEdges = graph.edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e, i) => ({ ...e, id: e.id ?? `e${i}` }));

  // If over 25 nodes, keep the most connected ones
  if (graph.nodes.length > 25) {
    const degree: Record<string, number> = {};
    graph.nodes.forEach((n) => (degree[n.id] = 0));
    validEdges.forEach((e) => {
      degree[e.source] = (degree[e.source] ?? 0) + 1;
      degree[e.target] = (degree[e.target] ?? 0) + 1;
    });
    const topNodes = [...graph.nodes]
      .sort((a, b) => (degree[b.id] ?? 0) - (degree[a.id] ?? 0))
      .slice(0, 25);
    const topIds = new Set(topNodes.map((n) => n.id));
    return {
      nodes: topNodes,
      edges: validEdges.filter((e) => topIds.has(e.source) && topIds.has(e.target)),
    };
  }

  return { nodes: graph.nodes, edges: validEdges };
}

function parseGraphResponse(raw: string): ArchGraph {
  const json = raw
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  const parsed = JSON.parse(json);
  const validated = GraphSchema.parse(parsed);
  return pruneGraph({
    nodes: validated.nodes,
    edges: validated.edges.map((e, i) => ({ ...e, id: e.id ?? `e${i}` })),
  });
}

export async function extractArchGraph(
  context: string,
  repoName: string
): Promise<ArchGraph> {
  const model = genAI.getGenerativeModel({ model: MODEL_FOR.graph });

  // First attempt
  try {
    const result = await model.generateContent(GRAPH_PROMPT(context, repoName));
    return parseGraphResponse(result.response.text());
  } catch (firstErr) {
    const hint = firstErr instanceof Error ? firstErr.message : String(firstErr);

    // Retry once with error hint
    try {
      const result = await model.generateContent(GRAPH_PROMPT(context, repoName, hint));
      return parseGraphResponse(result.response.text());
    } catch {
      // Both attempts failed — return minimal fallback
      return buildFallbackGraph(repoName);
    }
  }
}

export async function generateDocumentation(
  context: string,
  docType: DocType,
  repoName: string
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: MODEL_FOR[docType] });
  const result = await model.generateContent(PROMPTS[docType](context, repoName));
  return result.response.text();
}

export async function* streamDocumentation(
  context: string,
  docType: DocType,
  repoName: string
): AsyncGenerator<string> {
  const model = genAI.getGenerativeModel({ model: MODEL_FOR[docType] });
  const result = await model.generateContentStream(PROMPTS[docType](context, repoName));

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}
