"use client";

import { useEffect, useRef, useState, lazy, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArchGraph } from "@/lib/gemini";
import { cacheSet, cacheGet, cacheDel, cacheAge, docCacheKey } from "@/lib/cache";
import { postprocess, REQUIRED_SECTIONS, type LintIssue } from "@/lib/postprocess";

const ArchitectureGraph = lazy(() => import("@/components/ArchitectureGraph"));

const DOC_TYPE_LABELS: Record<string, string> = {
  "user-manual": "User Manual",
  "product-docs": "Product Documentation",
  architecture: "Architecture",
};

type View = "preview" | "raw" | "diagram";
type Params = { owner: string; repo: string; docType: string; token?: string; demo?: boolean };

function formatAge(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

// P0 #1: Demo mode — simulated streaming for pre-generated content
const DEMO_CONTENT = `# Architecture — expressjs/express

## System Overview
Express is a minimal, unopinionated Node.js web framework. It provides a thin layer of fundamental web application features without obscuring the core Node.js features.

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Language | JavaScript (CommonJS) |
| Core | HTTP module (native) |
| Router | Custom radix tree router |
| Middleware | Connect-style middleware chain |
| Testing | Mocha + Supertest |

## Key Components

### Application (\`lib/application.js\`)
The \`app\` object — extends Node's \`http.Server\`. Manages settings, middleware stack, and routing. Entry point for \`express()\`.

### Router (\`lib/router/index.js\`)
Processes request through the middleware/route stack. Supports \`use()\`, \`route()\`, and HTTP verb methods.

### Request (\`lib/request.js\`)
Extends Node's \`IncomingMessage\`. Adds helpers: \`req.params\`, \`req.query\`, \`req.body\`, \`req.ip\`, \`req.path\`.

### Response (\`lib/response.js\`)
Extends Node's \`ServerResponse\`. Adds: \`res.send()\`, \`res.json()\`, \`res.render()\`, \`res.redirect()\`, \`res.status()\`.

### Layer (\`lib/router/layer.js\`)
Matches a route path pattern to a handler using \`path-to-regexp\`.

## Data Flow

\`\`\`
HTTP Request
    ↓
app (Application)
    ↓
Router.handle()
    ↓
Layer matching (path-to-regexp)
    ↓
Middleware chain (next())
    ↓
Route handler
    ↓
res.send() / res.json()
    ↓
HTTP Response
\`\`\`

## Design Patterns
- **Middleware pattern**: Composable \`(req, res, next)\` functions chained via \`app.use()\`
- **Prototype extension**: Request/Response extend native Node objects via \`Object.create()\`
- **Router mounting**: Sub-routers mountable at path prefixes

## External Dependencies
- \`path-to-regexp\` — route pattern matching
- \`depd\` — deprecation notices
- \`vary\`, \`etag\`, \`fresh\` — HTTP cache helpers
- \`proxy-addr\`, \`forwarded\` — proxy/IP handling

## Deployment
Distributed as an npm package. No build step. Compatible with Node.js LTS and above.
`;

const DEMO_GRAPH: ArchGraph = {
  nodes: [
    { id: "client",   label: "HTTP Client",   type: "external",  description: "Browser or API consumer" },
    { id: "app",      label: "Application",   type: "service",   description: "express() — main app object" },
    { id: "router",   label: "Router",        type: "service",   description: "Radix tree router, middleware chain" },
    { id: "request",  label: "Request",       type: "service",   description: "Extended IncomingMessage" },
    { id: "response", label: "Response",      type: "service",   description: "Extended ServerResponse" },
    { id: "layer",    label: "Layer",         type: "service",   description: "Path matching via path-to-regexp" },
    { id: "handler",  label: "Route Handler", type: "frontend",  description: "User-defined middleware/handler" },
  ],
  edges: [
    { id: "e1", source: "client",   target: "app",      label: "HTTP request" },
    { id: "e2", source: "app",      target: "router",   label: "delegates to" },
    { id: "e3", source: "router",   target: "layer",    label: "matches path" },
    { id: "e4", source: "layer",    target: "handler",  label: "calls" },
    { id: "e5", source: "handler",  target: "response", label: "res.send()" },
    { id: "e6", source: "response", target: "client",   label: "HTTP response" },
    { id: "e7", source: "app",      target: "request",  label: "populates" },
  ],
};

export default function Preview() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [params, setParams] = useState<Params | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("preview");
  const [graph, setGraph] = useState<ArchGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState("");
  const [cacheAgeMs, setCacheAgeMs] = useState<number | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [truncated, setTruncated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("generate_params");
    if (!raw) {
      router.push("/dashboard");
      return;
    }
    const p: Params = JSON.parse(raw);
    setParams(p);

    // P0 #1: Demo mode
    if (p.demo || p.token === "demo") {
      setIsDemo(true);
      simulateStream(DEMO_CONTENT);
      return;
    }

    // P1 #7: localStorage cache
    const key = docCacheKey(p.owner, p.repo, p.docType);
    const cached = cacheGet(key);
    if (cached) {
      const result = postprocess(cached, { requiredSections: REQUIRED_SECTIONS[p.docType] });
      setContent(result.cleaned);
      setLintIssues(result.issues);
      setTruncated(result.truncated);
      setCacheAgeMs(cacheAge(key));
    } else {
      runGenerate(p);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function simulateStream(text: string) {
    setLoading(true);
    const chunks = text.match(/.{1,30}/gs) ?? [];
    let i = 0;
    let accumulated = "";
    function next() {
      if (i >= chunks.length) {
        setLoading(false);
        return;
      }
      accumulated += chunks[i++];
      setContent(accumulated);
      setTimeout(next, 12);
    }
    next();
  }

  const runGenerate = useCallback((p: Params) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError("");
    setContent("");
    setCacheAgeMs(null);

    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
      signal: abortRef.current.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error ${res.status}`);
        }
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setContent(accumulated);
        }
        cacheSet(docCacheKey(p.owner, p.repo, p.docType), accumulated);
        const result = postprocess(accumulated, { requiredSections: REQUIRED_SECTIONS[p.docType] });
        setContent(result.cleaned);
        setLintIssues(result.issues);
        setTruncated(result.truncated);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message ?? "Failed to generate documentation.");
          setLoading(false);
        }
      });
  }, []);

  function handleRegenerate() {
    if (!params) return;
    if (isDemo) {
      setGraph(null);
      simulateStream(DEMO_CONTENT);
      return;
    }
    cacheDel(docCacheKey(params.owner, params.repo, params.docType));
    setGraph(null);
    runGenerate(params);
  }

  async function loadGraph(p: Params) {
    if (isDemo) {
      setGraph(DEMO_GRAPH);
      return;
    }
    setGraphLoading(true);
    setGraphError("");
    try {
      const res = await fetch("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      setGraph(await res.json());
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setGraphLoading(false);
    }
  }

  function handleDiagramTab() {
    setView("diagram");
    if (!graph && !graphLoading && params) loadGraph(params);
  }

  function exportMarkdown() {
    if (!content || !params) return;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${params.repo}-${params.docType}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isArch = params?.docType === "architecture";

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(isDemo ? "/" : "/dashboard")}
            className="text-zinc-400 hover:text-white text-sm transition-colors"
          >
            ← Back
          </button>
          <div className="w-px h-4 bg-zinc-700" />
          <span className="font-semibold text-sm">
            {params
              ? `${params.owner}/${params.repo} — ${DOC_TYPE_LABELS[params.docType]}`
              : "Loading..."}
          </span>
          {isDemo && (
            <span className="text-xs bg-amber-900/50 border border-amber-700 text-amber-300 px-2 py-0.5 rounded-full">
              demo
            </span>
          )}
          {loading && (
            <span className="text-xs text-indigo-400 animate-pulse">Generating...</span>
          )}
          {!loading && cacheAgeMs !== null && (
            <span className="text-xs text-zinc-500">cached {formatAge(cacheAgeMs)}</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden text-xs">
            <button
              onClick={() => setView("preview")}
              className={`px-3 py-1.5 transition-colors ${view === "preview" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              Preview
            </button>
            <button
              onClick={() => setView("raw")}
              className={`px-3 py-1.5 transition-colors ${view === "raw" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              Markdown
            </button>
            {isArch && (
              <button
                onClick={handleDiagramTab}
                className={`px-3 py-1.5 transition-colors flex items-center gap-1 ${view === "diagram" ? "bg-indigo-700 text-white" : "text-zinc-400 hover:text-white"}`}
              >
                🏗️ Diagram
              </button>
            )}
          </div>

          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="border border-zinc-600 hover:border-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 hover:text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            ↺ Regenerate
          </button>

          <button
            onClick={exportMarkdown}
            disabled={!content || loading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Export .md
          </button>
        </div>
      </header>

      {/* P1 #8: AI disclaimer banner */}
      {content && !loading && (
        <div className="bg-zinc-900/60 border-b border-zinc-800 px-6 py-2 flex items-center gap-2">
          <span className="text-amber-500 text-xs">⚠️</span>
          <span className="text-zinc-500 text-xs">
            AI-generated content — may contain inaccuracies. Verify against source before publishing.
          </span>
        </div>
      )}

      <main className="flex-1 overflow-hidden relative">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-3 max-w-lg text-center">
              {error}
            </p>
          </div>
        ) : view === "diagram" ? (
          <div className="w-full" style={{ height: "calc(100vh - 100px)" }}>
            {graphLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-400 text-sm">Extracting architecture graph...</p>
              </div>
            ) : graphError ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-3">
                  {graphError}
                </p>
                <button onClick={() => params && loadGraph(params)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline">
                  Retry
                </button>
              </div>
            ) : graph ? (
              <Suspense fallback={
                <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                  Loading diagram...
                </div>
              }>
                <ArchitectureGraph graph={graph} />
              </Suspense>
            ) : null}
          </div>
        ) : view === "raw" ? (
          <pre className="p-6 text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed overflow-y-auto h-full">
            {content || "Waiting for content..."}
          </pre>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-10 overflow-y-auto h-full">
            <div className="prose prose-invert prose-zinc max-w-none prose-headings:text-white prose-p:text-zinc-300 prose-code:text-indigo-300 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 prose-a:text-indigo-400 prose-strong:text-white prose-th:text-white prose-td:text-zinc-300">
              {content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : loading ? (
                <div className="space-y-3 animate-pulse">
                  {[75, 90, 60, 85, 70, 95, 65, 80].map((w, i) => (
                    <div key={i} className="h-4 bg-zinc-800 rounded" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
