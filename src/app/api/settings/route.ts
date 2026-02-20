import { requireSession } from "@/lib/auth-server";
import { getSettings, updateSettings, getEffectiveAIConfig } from "@/lib/settings";

/** GET /api/settings — Return current settings (keys are masked). */
export async function GET() {
  try {
    await requireSession();
    const s = await getSettings();

    // Mask API keys: show last 4 chars only
    const mask = (v: string | null) =>
      v ? `${"*".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : "";

    return Response.json({
      aiProvider: s.aiProvider || "",
      aiModel: s.aiModel || "",
      openaiBaseUrl: s.openaiBaseUrl || "",
      // Masked keys
      openaiApiKey: mask(s.openaiApiKey),
      anthropicApiKey: mask(s.anthropicApiKey),
      googleAiApiKey: mask(s.googleAiApiKey),
      mistralApiKey: mask(s.mistralApiKey),
      xaiApiKey: mask(s.xaiApiKey),
      deepseekApiKey: mask(s.deepseekApiKey),
      moonshotApiKey: mask(s.moonshotApiKey),
      openrouterApiKey: mask(s.openrouterApiKey),
      perplexityApiKey: mask(s.perplexityApiKey),
      minimaxApiKey: mask(s.minimaxApiKey),
      glmApiKey: mask(s.glmApiKey),
      huggingfaceApiKey: mask(s.huggingfaceApiKey),
      vercelAiGatewayKey: mask(s.vercelAiGatewayKey),
      // Embedding
      embeddingProvider: s.embeddingProvider || "",
      embeddingModel: s.embeddingModel || "",
      embeddingApiKey: mask(s.embeddingApiKey),
      embeddingBaseUrl: s.embeddingBaseUrl || "",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** PATCH /api/settings — Update settings fields. */
export async function PATCH(req: Request) {
  try {
    await requireSession();
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

    const updated = await updateSettings(data);

    return Response.json({ status: "ok", updatedAt: updated.updatedAt });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
