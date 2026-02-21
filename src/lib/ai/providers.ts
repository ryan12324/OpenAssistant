import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";
import { getEffectiveAIConfig } from "@/lib/settings";
import { getLogger, maskSecret } from "@/lib/logger";

const log = getLogger("ai.providers");

/**
 * Supported AI provider identifiers.
 * Each maps to a specific API endpoint or SDK.
 */
export type AIProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "xai"
  | "deepseek"
  | "moonshot"
  | "openrouter"
  | "perplexity"
  | "ollama"
  | "lmstudio"
  | "minimax"
  | "glm"
  | "huggingface"
  | "vercel";

/** Configuration for resolving an AI model instance. */
export interface ModelConfig {
  provider: AIProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Provider endpoint and default model registry.
 * OpenAI-compatible providers use `createOpenAI` with a custom baseURL.
 * Native SDK providers (Anthropic, Google, Mistral, xAI) also use
 * the OpenAI-compatible adapter since @ai-sdk/openai's `createOpenAI`
 * supports any OpenAI-compatible endpoint and these providers all
 * expose compatible endpoints.
 */
const PROVIDER_DEFAULTS: Record<
  AIProvider,
  { baseUrl: string; defaultModel: string; envKey: string; headerKey?: string }
> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    envKey: "OPENAI_API_KEY",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5-20250929",
    envKey: "ANTHROPIC_API_KEY",
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-pro",
    envKey: "GOOGLE_AI_API_KEY",
  },
  mistral: {
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    envKey: "MISTRAL_API_KEY",
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3",
    envKey: "XAI_API_KEY",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
  },
  moonshot: {
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-2.5",
    envKey: "MOONSHOT_API_KEY",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o",
    envKey: "OPENROUTER_API_KEY",
  },
  perplexity: {
    baseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar-pro",
    envKey: "PERPLEXITY_API_KEY",
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    envKey: "",
  },
  lmstudio: {
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    envKey: "",
  },
  minimax: {
    baseUrl: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-M2.1",
    envKey: "MINIMAX_API_KEY",
  },
  glm: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-plus",
    envKey: "GLM_API_KEY",
  },
  huggingface: {
    baseUrl: "https://api-inference.huggingface.co/v1",
    defaultModel: "meta-llama/Llama-3.1-70B-Instruct",
    envKey: "HUGGINGFACE_API_KEY",
  },
  vercel: {
    baseUrl: "https://gateway.ai.vercel.app/v1",
    defaultModel: "openai/gpt-4o",
    envKey: "VERCEL_AI_GATEWAY_KEY",
  },
};

/**
 * Create a Vercel AI SDK LanguageModel from a ModelConfig.
 * All providers are accessed through OpenAI-compatible endpoints using createOpenAI.
 */
export function resolveModel(config: ModelConfig): LanguageModelV1 {
  const defaults = PROVIDER_DEFAULTS[config.provider];
  if (!defaults) {
    log.error("Unknown AI provider requested", { provider: config.provider });
    throw new Error(`Unknown AI provider: ${config.provider}`);
  }

  const baseURL = config.baseUrl || defaults.baseUrl;
  const apiKey = config.apiKey || (defaults.envKey ? process.env[defaults.envKey] : undefined) || "";
  const modelId = config.model || defaults.defaultModel;

  log.info("Resolving AI model", {
    provider: config.provider,
    modelId,
    baseURL,
    apiKey: maskSecret(apiKey),
  });

  const client = createOpenAI({
    baseURL,
    apiKey,
    compatibility: "compatible",
  });

  return client(modelId);
}

/**
 * Resolve a model using DB-stored settings (with env fallback).
 * This is the primary entry point — use this in all server-side code.
 */
export async function resolveModelFromSettings(): Promise<LanguageModelV1> {
  log.debug("Resolving model from settings");

  const config = await getEffectiveAIConfig();

  const configProvider = (config.provider || "openai") as AIProvider;
  const modelStr = config.model || "";

  if (modelStr) {
    log.info("Resolved model from settings", {
      provider: configProvider,
      model: modelStr,
      baseUrl: config.baseUrl || undefined,
      apiKey: maskSecret(config.apiKey),
    });

    return resolveModel({
      provider: configProvider,
      model: modelStr,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || undefined,
    });
  }

  log.debug("No model string in settings, falling back to provider default", {
    provider: configProvider,
  });

  const defaults = PROVIDER_DEFAULTS[configProvider];
  return resolveModel({
    provider: configProvider,
    model: defaults?.defaultModel || "gpt-4o",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl || undefined,
  });
}

/**
 * Get the list of all supported providers with their default models.
 */
export function getProviderList() {
  const list = Object.entries(PROVIDER_DEFAULTS).map(([id, config]) => ({
    id: id as AIProvider,
    defaultModel: config.defaultModel,
    envKey: config.envKey,
    baseUrl: config.baseUrl,
  }));

  log.debug("Returning provider list", { providerCount: list.length });

  return list;
}
