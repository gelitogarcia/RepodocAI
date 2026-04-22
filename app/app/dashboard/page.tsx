"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Repo = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  private: boolean;
};

const DOC_TYPES = [
  {
    id: "user-manual",
    label: "User Manual",
    description: "Installation, usage guide, FAQ",
    icon: "📖",
  },
  {
    id: "product-docs",
    label: "Product Documentation",
    description: "Features, API reference, changelog",
    icon: "📋",
  },
  {
    id: "architecture",
    label: "Architecture",
    description: "Tech stack, components, data flow",
    icon: "🏗️",
  },
];

export default function Dashboard() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [search, setSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [selectedDocType, setSelectedDocType] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionStorage.getItem("gh_connected")) {
      router.push("/");
      return;
    }
    const t = sessionStorage.getItem("gh_token");
    setToken(t);
    const headers: Record<string, string> = {};
    if (t) headers["x-github-token"] = t;
    fetch("/api/repos", { headers })
      .then((r) => r.json())
      .then((data) => setRepos(Array.isArray(data) ? data : []))
      .catch(() => setError("Failed to load repositories"))
      .finally(() => setLoading(false));
  }, [router]);

  const filtered = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleGenerate() {
    if (!selectedRepo || !selectedDocType) return;
    setGenerating(true);
    sessionStorage.setItem(
      "generate_params",
      JSON.stringify({
        owner: selectedRepo.owner.login,
        repo: selectedRepo.name,
        docType: selectedDocType,
        ...(token ? { token } : {}),
      })
    );
    router.push("/preview");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400 text-sm animate-pulse">
          Loading repositories...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">📄</span>
          <span className="font-bold text-white">RepoDoc AI</span>
        </div>
        <button
          onClick={() => {
            sessionStorage.clear();
            router.push("/?disconnected=1");
          }}
          className="text-zinc-400 hover:text-white text-sm transition-colors"
        >
          Disconnect
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        <div>
          <h2 className="text-xl font-semibold mb-1">Select a Repository</h2>
          <p className="text-zinc-400 text-sm mb-4">
            {repos.length} repositories found
          </p>
          <input
            type="text"
            placeholder="Search repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          />
          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}
          <div className="grid gap-2 max-h-80 overflow-y-auto pr-1">
            {filtered.map((repo) => (
              <button
                key={repo.id}
                onClick={() => setSelectedRepo(repo)}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  selectedRepo?.id === repo.id
                    ? "border-indigo-500 bg-indigo-950"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{repo.name}</span>
                    {repo.private && (
                      <span className="text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded">
                        private
                      </span>
                    )}
                    {repo.language && (
                      <span className="text-xs text-zinc-500">
                        {repo.language}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500">
                    ⭐ {repo.stargazers_count}
                  </span>
                </div>
                {repo.description && (
                  <p className="text-zinc-400 text-xs mt-1 truncate">
                    {repo.description}
                  </p>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-zinc-500 text-sm text-center py-8">
                No repositories match your search
              </p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">
            Choose Documentation Type
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {DOC_TYPES.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDocType(doc.id)}
                className={`p-5 rounded-xl border text-left transition-colors ${
                  selectedDocType === doc.id
                    ? "border-indigo-500 bg-indigo-950"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                }`}
              >
                <div className="text-2xl mb-2">{doc.icon}</div>
                <p className="font-semibold text-sm">{doc.label}</p>
                <p className="text-zinc-400 text-xs mt-1">{doc.description}</p>
              </button>
            ))}
          </div>
        </div>

        {selectedRepo && selectedDocType && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Ready to generate</p>
              <p className="font-semibold">
                {selectedRepo.full_name} →{" "}
                {DOC_TYPES.find((d) => d.id === selectedDocType)?.label}
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
            >
              {generating ? "Loading..." : "Generate →"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
