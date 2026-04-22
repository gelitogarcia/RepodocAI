import { buildRepoContext } from "@/lib/github";
import { streamDocumentation, DocType } from "@/lib/gemini";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  let body: { owner?: string; repo?: string; docType?: string; token?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { owner, repo, docType } = body;
  const token = body.token ?? process.env.GITHUB_PAT;

  if (!owner || !repo || !docType || !token) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const context = await buildRepoContext(token, owner, repo);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamDocumentation(
            context,
            docType as DocType,
            `${owner}/${repo}`
          )) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(encoder.encode(`\n\n⚠️ Error: ${msg}`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate] error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
