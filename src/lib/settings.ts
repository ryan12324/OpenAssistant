import { prisma } from "@/lib/prisma";
import type { AppSettings } from "@prisma/client";

const SETTINGS_ID = "singleton";

/** Column name -> env var mapping for API keys */
const KEY_ENV_MAP: Record<string, string> = {
  openaiApiKey: "OPENAI_API_KEY",
  anthropicApiKey: "ANTHROPIC_API_KEY",
  googleAiApiKey: "GOOGLE_AI_API_KEY",
  mistralApiKey: "MISTRAL_API_KEY",
  xaiApiKey: "XAI_API_KEY",
  deepseekApiKey: "DEEPSEEK_API_KEY",
  openrouterApiKey: "OPENROUTER_API_KEY",
  perplexityApiKey: "PERPLEXITY_API_KEY",
  minimaxApiKey: "MINIMAX_API_KEY",
  glmApiKey: "GLM_API_KEY",
  huggingfaceApiKey: "HUGGINGFACE_API_KEY",
  vercelAiGatewayKey: "VERCEL_AI_GATEWAY_KEY",
};

/** Provider id -> DB column name for its API key */
export const PROVIDER_KEY_COLUMN: Record<string, keyof AppSettings> = {
  openai: "openaiApiKey",
  anthropic: "anthropicApiKey",
  google: "googleAiApiKey",
  mistral: "mistralApiKey",
  xai: "xaiApiKey",
  deepseek: "deepseekApiKey",
  openrouter: "openrouterApiKey",
  perplexity: "perplexityApiKey",
  minimax: "minimaxApiKey",
  glm: "glmApiKey",
  huggingface: "huggingfaceApiKey",
  vercel: "vercelAiGatewayKey",
};

/**
 * Get the singleton AppSettings row.
 * Returns the DB row merged over env defaults — DB values win when set.
 */
export async function getSettings(): Promise<AppSettings> {
  let row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });

  if (!row) {
    row = await prisma.appSettings.create({ data: { id: SETTINGS_ID } });
  }

  return row;
}

/**
 * Update settings. Accepts a partial set of fields.
 */
export async function updateSettings(
  data: Partial<Omit<AppSettings, "id" | "updatedAt">>
): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
}

/**
 * Resolve the effective AI config (DB values take precedence over env vars).
 * This is the single source of truth used by both providers.ts and the RAG server.
 */
export async function getEffectiveAIConfig() {
  const s = await getSettings();

  const provider = s.aiProvider || process.env.AI_PROVIDER || "openai";
  const model = s.aiModel || process.env.AI_MODEL || "";
  const baseUrl = s.openaiBaseUrl || process.env.OPENAI_BASE_URL || "";

  // Resolve API key: DB column for the active provider, then env var
  const col = PROVIDER_KEY_COLUMN[provider];
  const dbKey = col ? (s[col] as string | null) : null;
  const envKeyName = KEY_ENV_MAP[col as string] || "";
  const apiKey = dbKey || (envKeyName ? process.env[envKeyName] || "" : "");

  // Embedding
  const embeddingModel = s.embeddingModel || process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  const embeddingApiKey = s.embeddingApiKey || process.env.EMBEDDING_API_KEY || apiKey;
  const embeddingBaseUrl = s.embeddingBaseUrl || process.env.EMBEDDING_BASE_URL || baseUrl;

  return {
    provider,
    model,
    apiKey,
    baseUrl,
    embeddingModel,
    embeddingApiKey,
    embeddingBaseUrl,
  };
}
