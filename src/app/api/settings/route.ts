import { requireSession } from "@/lib/auth-server";
import { getSettings, updateSettings, getEffectiveAIConfig } from "@/lib/settings";
import { getLogger, maskSecret } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";

const log = getLogger("api.settings");

/** GET /api/settings — Return current settings (keys are masked). */
export async function GET() {
  try {
    const session = await requireSession();
    log.info("Fetching settings", { userId: session?.user?.id });

    const s = await getSettings();

    log.debug("Settings retrieved", {
      userId: session?.user?.id,
      provider: s.aiProvider || "",
      model: s.aiModel || "",
    });

    return Response.json({
      aiProvider: s.aiProvider || "",
      aiModel: s.aiModel || "",
      openaiBaseUrl: s.openaiBaseUrl || "",
      // Masked keys
      openaiApiKey: maskSecret(s.openaiApiKey),
      anthropicApiKey: maskSecret(s.anthropicApiKey),
      googleAiApiKey: maskSecret(s.googleAiApiKey),
      mistralApiKey: maskSecret(s.mistralApiKey),
      xaiApiKey: maskSecret(s.xaiApiKey),
      deepseekApiKey: maskSecret(s.deepseekApiKey),
      moonshotApiKey: maskSecret(s.moonshotApiKey),
      openrouterApiKey: maskSecret(s.openrouterApiKey),
      perplexityApiKey: maskSecret(s.perplexityApiKey),
      minimaxApiKey: maskSecret(s.minimaxApiKey),
      glmApiKey: maskSecret(s.glmApiKey),
      huggingfaceApiKey: maskSecret(s.huggingfaceApiKey),
      vercelAiGatewayKey: maskSecret(s.vercelAiGatewayKey),
      // Embedding
      embeddingProvider: s.embeddingProvider || "",
      embeddingModel: s.embeddingModel || "",
      embeddingApiKey: maskSecret(s.embeddingApiKey),
      embeddingBaseUrl: s.embeddingBaseUrl || "",
    });
  } catch (error) {
    return handleApiError(error, "GET /api/settings");
  }
}

/** PATCH /api/settings — Update settings fields. */
export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();

    // Whitelist allowed fields
    const allowed = [
      "aiProvider",
      "aiModel",
      "openaiBaseUrl",
      "openaiApiKey",
      "anthropicApiKey",
      "googleAiApiKey",
      "mistralApiKey",
      "xaiApiKey",
      "deepseekApiKey",
      "moonshotApiKey",
      "openrouterApiKey",
      "perplexityApiKey",
      "minimaxApiKey",
      "glmApiKey",
      "huggingfaceApiKey",
      "vercelAiGatewayKey",
      "embeddingProvider",
      "embeddingModel",
      "embeddingApiKey",
      "embeddingBaseUrl",
    ] as const;

    const data: Record<string, string | null> = {};
    for (const key of allowed) {
      if (key in body) {
        // Empty string → null (clear the field, fall back to env)
        data[key] = body[key] === "" ? null : body[key];
      }
    }

    const fieldNames = Object.keys(data);
    log.info("Updating settings", {
      userId: session?.user?.id,
      fields: fieldNames,
    });

    log.debug("Applied settings fields", {
      userId: session?.user?.id,
      appliedFields: fieldNames,
      fieldCount: fieldNames.length,
    });

    const updated = await updateSettings(data);

    log.info("Settings updated successfully", {
      userId: session?.user?.id,
      updatedAt: updated.updatedAt,
    });

    return Response.json({ status: "ok", updatedAt: updated.updatedAt });
  } catch (error) {
    return handleApiError(error, "PATCH /api/settings");
  }
}
