"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const DEMO_PARAMS = {
  owner: "expressjs",
  repo: "express",
  docType: "architecture",
  demo: true,
};

function HomeInner() {
  const [status, setStatus] = useState<"checking" | "ready" | "error">("checking");
  const [pat, setPat] = useState("");
  const [patError, setPatError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const disconnected = searchParams.get("disconnected") === "1";

  useEffect(() => {
    if (disconnected) {
      setStatus("error");
      return;
    }
    fetch("/api/repos")
      .then((r) => {
        if (!r.ok) throw new Error();
        sessionStorage.setItem("gh_connected", "true");
        sessionStorage.removeItem("gh_token");
        router.push("/dashboard");
      })
      .catch(() => setStatus("error"));
  }, [router, disconnected]);

  async function handleConnect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pat.trim()) return;
    setConnecting(true);
    setPatError("");
    try {
      const res = await fetch("/api/repos", {
        headers: { "x-github-token": pat.trim() },
      });
      if (!res.ok) throw new Error("Token invalid or missing 'repo' scope.");
      sessionStorage.setItem("gh_token", pat.trim());
      sessionStorage.setItem("gh_connected", "true");
      router.push("/dashboard");
    } catch (err) {
      setPatError(err instanceof Error ? err.message : "Could not connect.");
      setConnecting(false);
    }
  }

  function handleDemo() {
    sessionStorage.setItem("generate_params", JSON.stringify(DEMO_PARAMS));
    router.push("/preview");
  }

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm">Connecting to GitHub...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-4xl">
            <span>📄</span><span>✨</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">RepoDoc AI</h1>
          <p className="text-zinc-400 text-base">
            Generate documentation from any GitHub repository using Gemini AI
          </p>
        </div>

        <form onSubmit={handleConnect} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              GitHub Personal Access Token
            </label>
            <input
              type="password"
              value={pat}
              onChange={(e) => { setPat(e.target.value); setPatError(""); }}
              placeholder="ghp_..."
              autoComplete="off"
              className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {patError && (
              <p className="mt-1.5 text-xs text-red-400">{patError}</p>
            )}
          </div>
          <p className="text-zinc-600 text-xs">
            Requires <code className="text-zinc-500">repo</code> scope.{" "}
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=RepoDoc+AI"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              Create token
            </a>{" "}
            — stored in sessionStorage only, never sent to our servers.
          </p>
          <button
            type="submit"
            disabled={!pat.trim() || connecting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {connecting ? "Connecting..." : "Connect to GitHub →"}
          </button>
        </form>

        <div className="relative flex items-center gap-3">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-xs text-zinc-600">or</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <button
          onClick={handleDemo}
          className="w-full border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-semibold rounded-lg px-4 py-3 text-sm transition-colors"
        >
          Try with demo repo (no token needed)
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm">Connecting to GitHub...</p>
      </div>
    }>
      <HomeInner />
    </Suspense>
  );
}
