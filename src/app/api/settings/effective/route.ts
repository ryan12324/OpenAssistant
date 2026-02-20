import { getEffectiveAIConfig } from "@/lib/settings";

/**
 * GET /api/settings/effective
 * Returns the resolved AI config (DB values merged with env fallbacks).
 * Protected by RAG_API_KEY so the RAG server can call it.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const ragKey = process.env.RAG_API_KEY;

  if (ragKey && authHeader !== `Bearer ${ragKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getEffectiveAIConfig();
    return Response.json(config);
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
