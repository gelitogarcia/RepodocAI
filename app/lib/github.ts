import { Octokit } from "@octokit/rest";

export function getOctokit(token: string) {
  return new Octokit({ auth: token });
}

export async function listUserRepos(token: string) {
  const octokit = getOctokit(token);
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 50,
  });
  return data;
}

export async function getRepoTree(token: string, owner: string, repo: string) {
  const octokit = getOctokit(token);
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const branch = repoData.default_branch;
  const { data } = await octokit.git.getTree({ owner, repo, tree_sha: branch, recursive: "1" });
  return data.tree.filter((f) => f.type === "blob").slice(0, 500);
}

export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<string> {
  const octokit = getOctokit(token);
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    if ("content" in data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
  } catch {
    // file too large or binary
  }
  return "";
}

// P1 #5: Deterministic file selection by category priority

const CONFIG_FILES = [
  "README.md", "readme.md", "README.rst",
  "package.json", "package-lock.json",
  "pyproject.toml", "requirements.txt", "setup.py", "setup.cfg",
  "Cargo.toml", "go.mod", "go.sum",
  "pom.xml", "build.gradle", "build.gradle.kts",
  "tsconfig.json", "jsconfig.json",
  "next.config.js", "next.config.ts", "next.config.mjs",
  "vite.config.ts", "vite.config.js",
  "vercel.json", "netlify.toml", "railway.json",
  "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
  ".env.example", ".env.sample",
];

const ENTRY_PATTERNS = [
  /^(src\/)?(app|pages)\/(layout|page)\.(tsx?|jsx?)$/,
  /^(src\/)?pages\/_app\.(tsx?|jsx?)$/,
  /^(src\/)?(main|index)\.(tsx?|jsx?|py|go|rs|java|cs)$/,
  /^(src\/)?server\.(tsx?|jsx?|py|go)$/,
  /^(app|src)\/(main|app)\.(py|go|rs|java|cs)$/,
  /^__main__\.py$/,
];

const API_ROUTE_PATTERNS = [
  /^(app|pages)\/api\//,
  /^(src\/)?(routes?|api|controllers?|handlers?)\//,
];

const CODE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx",
  ".py", ".go", ".rs", ".java", ".cs",
  ".rb", ".php", ".swift", ".kt", ".vue", ".svelte",
];

function stripComments(content: string, ext: string): string {
  if ([".ts", ".tsx", ".js", ".jsx", ".go", ".java", ".cs", ".swift", ".kt"].includes(ext)) {
    return content
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\n/gm, "");
  }
  if (ext === ".py") {
    return content
      .replace(/#.*$/gm, "")
      .replace(/^\s*\n/gm, "");
  }
  return content;
}

function scoreFile(path: string): number {
  const depth = path.split("/").length;
  const ext = "." + path.split(".").pop();

  if (ENTRY_PATTERNS.some((p) => p.test(path))) return 100;
  if (API_ROUTE_PATTERNS.some((p) => p.test(path))) return 80;
  if (path.startsWith("src/") && CODE_EXTENSIONS.includes(ext)) return 60 - depth;
  if (CODE_EXTENSIONS.includes(ext)) return 40 - depth;
  return 0;
}

export async function buildRepoContext(
  token: string,
  owner: string,
  repo: string
): Promise<string> {
  const octokit = getOctokit(token);
  const tree = await getRepoTree(token, owner, repo);
  const filePaths = tree.map((f) => f.path ?? "");
  const folderStructure = filePaths.slice(0, 120).join("\n");

  const fetched: string[] = [];

  // 1. Config + manifest files (highest priority, always include)
  for (const cf of CONFIG_FILES) {
    const found = filePaths.find((p) => p === cf || p.endsWith("/" + cf));
    if (found) {
      const raw = await getFileContent(token, owner, repo, found);
      if (raw) {
        const ext = "." + found.split(".").pop();
        const cleaned = stripComments(raw, ext).slice(0, 4000);
        fetched.push(`### ${found}\n\`\`\`\n${cleaned}\n\`\`\``);
      }
    }
  }

  // 2. Scored code files — entries + API routes first, then by depth
  const codeFiles = filePaths
    .filter((p) => CODE_EXTENSIONS.some((ext) => p.endsWith(ext)))
    .map((p) => ({ path: p, score: scoreFile(p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map((f) => f.path);

  for (const file of codeFiles) {
    const raw = await getFileContent(token, owner, repo, file);
    if (raw) {
      const ext = "." + file.split(".").pop();
      const cleaned = stripComments(raw, ext).slice(0, 4000);
      fetched.push(`### ${file}\n\`\`\`\n${cleaned}\n\`\`\``);
    }
  }

  const { data: commits } = await octokit.repos.listCommits({ owner, repo, per_page: 20 });
  const commitLog = commits.map((c) => `- ${c.commit.message.split("\n")[0]}`).join("\n");

  return `# Repository: ${owner}/${repo}

## Folder Structure
\`\`\`
${folderStructure}
\`\`\`

## Key Files
${fetched.join("\n\n")}

## Recent Commits
${commitLog}
`;
}
