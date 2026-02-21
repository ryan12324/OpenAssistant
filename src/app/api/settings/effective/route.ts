import { getEffectiveAIConfig } from "@/lib/settings";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.settings.effective");

/**
 * GET /api/settings/effective
 * Returns the resolved AI config (DB values merged with env fallbacks).
 * Protected by RAG_API_KEY so the RAG server can call it.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const ragKey = process.env.RAG_API_KEY;

  if (ragKey && authHeader !== `Bearer ${ragKey}`) {
    log.warn("Unauthorized access attempt on GET /api/settings/effective", {
      hasAuthHeader: !!authHeader,
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  log.info("Fetching effective AI config");

  try {
    const config = await getEffectiveAIConfig();

    log.debug("Effective AI config retrieved", {
      provider: config.provider,
      model: config.model,
    });

    return Response.json(config);
  } catch (error) {
    log.error("Failed to fetch effective AI config", { error });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
