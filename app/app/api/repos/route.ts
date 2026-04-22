import { listUserRepos } from "@/lib/github";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.headers.get("x-github-token") ?? process.env.GITHUB_PAT;
  if (!token) {
    return Response.json({ error: "No GitHub token configured" }, { status: 401 });
  }

  try {
    const repos = await listUserRepos(token);
    return Response.json(repos);
  } catch {
    return Response.json({ error: "Failed to fetch repos" }, { status: 500 });
  }
}
