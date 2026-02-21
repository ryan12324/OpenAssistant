import { getLogger } from "@/lib/logger";

const log = getLogger("api.health");

export async function GET() {
  const ragUrl = process.env.RAG_SERVER_URL || "http://localhost:8020";

  log.debug("Health check started", { ragUrl });

  try {
    const res = await fetch(`${ragUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    log.debug("Health check succeeded", { data });
    return Response.json(data);
  } catch {
    log.warn("Health check failed: RAG server unreachable", { ragUrl });
    return Response.json({
      status: "error",
      lightrag: false,
      rag_anything: false,
      message: "RAG server unreachable",
    });
  }
}
