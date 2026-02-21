import { prisma } from "@/lib/prisma";
import type { AppSettings } from "@/generated/prisma/client";
import { getLogger, maskSecret } from "@/lib/logger";

const log = getLogger("settings");

const SETTINGS_ID = "singleton";

/** Column name -> env var mapping for API keys */
const KEY_ENV_MAP: Record<string, string> = {
  openaiApiKey: "OPENAI_API_KEY",
  anthropicApiKey: "ANTHROPIC_API_KEY",
  googleAiApiKey: "GOOGLE_AI_API_KEY",
  mistralApiKey: "MISTRAL_API_KEY",
  xaiApiKey: "XAI_API_KEY",
  deepseekApiKey: "DEEPSEEK_API_KEY",
  moonshotApiKey: "MOONSHOT_API_KEY",
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
  moonshot: "moonshotApiKey",
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
  log.debug("Fetching settings from database");
  let row = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } });

  if (!row) {
    log.info("No settings row found — creating default singleton");
    row = await prisma.appSettings.create({ data: { id: SETTINGS_ID } });
  }

  log.debug("Settings loaded", { provider: row.aiProvider, model: row.aiModel });
  return row;
}

/**
 * Update settings. Accepts a partial set of fields.
 */
export async function updateSettings(
  data: Partial<Omit<AppSettings, "id" | "updatedAt">>
): Promise<AppSettings> {
  log.info("Updating settings", { fields: Object.keys(data) });
  const result = await prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  log.info("Settings updated successfully", { updatedAt: result.updatedAt });
  return result;
}

/** Shape returned by getEffectiveAIConfig(). */
export interface EffectiveAIConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingApiKey: string;
  embeddingBaseUrl: string;
}

/**
 * Resolve an API key for a given provider.
 * Checks the DB column first, then falls back to the corresponding env var.
 */
function resolveApiKey(
  provider: string,
  settings: AppSettings | null,
  envKey: string | undefined
): string {
  // Check DB first
  const col = PROVIDER_KEY_COLUMN[provider];
  const dbKey = col ? (settings?.[col] as string | null) : null;
  if (dbKey) return dbKey;
  // Fall back to env
  const envKeyName = col ? (KEY_ENV_MAP[col as string] || "") : "";
  if (envKeyName && process.env[envKeyName]) return process.env[envKeyName]!;
  return envKey ?? "";
}

/**
 * Resolve the effective AI config (DB values take precedence over env vars).
 * This is the single source of truth used by both providers.ts and the RAG server.
 */
export async function getEffectiveAIConfig(): Promise<EffectiveAIConfig> {
  log.debug("Resolving effective AI config");
  const s = await getSettings();

  const provider = s.aiProvider || process.env.AI_PROVIDER || "openai";
  const model = s.aiModel || process.env.AI_MODEL || "";
  const baseUrl = s.openaiBaseUrl || process.env.OPENAI_BASE_URL || "";

  // Resolve API key: DB column for the active provider, then env var
  const apiKey = resolveApiKey(provider, s, undefined);

  const col = PROVIDER_KEY_COLUMN[provider];
  const dbKey = col ? (s[col] as string | null) : null;
  const envKeyName = col ? (KEY_ENV_MAP[col as string] || "") : "";
  const keySource = dbKey ? "database" : envKeyName && process.env[envKeyName] ? "env" : "none";

  log.info("Effective AI config resolved", {
    provider,
    model: model || "(default)",
    baseUrl: baseUrl || "(default)",
    apiKeySource: keySource,
    apiKeyMasked: maskSecret(apiKey),
  });

  // Embedding — resolve provider, then derive defaults from it
  const embeddingProvider = s.embeddingProvider || process.env.EMBEDDING_PROVIDER || "";
  const embeddingModel = s.embeddingModel || process.env.EMBEDDING_MODEL || (process.env.DEFAULT_EMBEDDING_MODEL ?? "text-embedding-3-small");

  // If an embedding provider is set, resolve its API key and base URL independently
  let embeddingApiKey = s.embeddingApiKey || process.env.EMBEDDING_API_KEY || "";
  let embeddingBaseUrl = s.embeddingBaseUrl || process.env.EMBEDDING_BASE_URL || "";

  if (embeddingProvider && embeddingProvider !== provider) {
    // Resolve API key from the embedding provider's DB column / env var
    if (!embeddingApiKey) {
      embeddingApiKey = resolveApiKey(embeddingProvider, s, undefined);
    }
    // embeddingBaseUrl is left empty here — the RAG server / provider resolver
    // will fill it from PROVIDER_DEFAULTS using embeddingProvider
  } else {
    // Same provider — fall back to LLM provider's key and base URL
    embeddingApiKey = embeddingApiKey || apiKey;
    embeddingBaseUrl = embeddingBaseUrl || baseUrl;
  }

  if (embeddingProvider) {
    log.debug("Embedding config resolved", {
      embeddingProvider,
      embeddingModel,
      embeddingBaseUrl: embeddingBaseUrl || "(default)",
    });
  }

  return {
    provider,
    model,
    apiKey,
    baseUrl,
    embeddingProvider,
    embeddingModel,
    embeddingApiKey,
    embeddingBaseUrl,
  };
}
