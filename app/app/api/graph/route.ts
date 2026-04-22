import { buildRepoContext } from "@/lib/github";
import { extractArchGraph } from "@/lib/gemini";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  let body: { owner?: string; repo?: string; token?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { owner, repo } = body;
  const token = body.token ?? process.env.GITHUB_PAT;

  if (!owner || !repo || !token) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const context = await buildRepoContext(token, owner, repo);
    const graph = await extractArchGraph(context, `${owner}/${repo}`);
    return Response.json(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[graph] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
