import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";
import { getEffectiveAIConfig } from "@/lib/settings";

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
 * Resolve a model string like "openai/gpt-4o" or "anthropic/claude-sonnet-4-5-20250929"
 * into a provider and model name.
 */
export function parseModelString(modelStr: string): { provider: AIProvider; model: string } {
  const slash = modelStr.indexOf("/");
  if (slash > 0) {
    const provider = modelStr.slice(0, slash) as AIProvider;
    const model = modelStr.slice(slash + 1);
    if (provider in PROVIDER_DEFAULTS) {
      return { provider, model };
    }
  }
  // Default to OpenAI if no provider prefix
  return { provider: "openai", model: modelStr };
}

/**
 * Create a Vercel AI SDK LanguageModel from a ModelConfig.
 * All providers are accessed through OpenAI-compatible endpoints using createOpenAI.
 */
export function resolveModel(config: ModelConfig): LanguageModelV1 {
  const defaults = PROVIDER_DEFAULTS[config.provider];
  if (!defaults) {
    throw new Error(`Unknown AI provider: ${config.provider}`);
  }

  const baseURL = config.baseUrl || defaults.baseUrl;
  const apiKey = config.apiKey || (defaults.envKey ? process.env[defaults.envKey] : undefined) || "";
  const modelId = config.model || defaults.defaultModel;

  const client = createOpenAI({
    baseURL,
    apiKey,
    compatibility: "compatible",
  });

  return client(modelId);
}

/**
 * Resolve a model from a simple string like "gpt-4o" or "anthropic/claude-sonnet-4-5-20250929".
 * Falls back to env vars AI_PROVIDER / AI_MODEL / OPENAI_API_KEY.
 */
export function resolveModelFromString(modelStr?: string): LanguageModelV1 {
  if (modelStr) {
    const { provider, model } = parseModelString(modelStr);
    return resolveModel({ provider, model });
  }

  // Fall back to environment-configured defaults
  const envProvider = (process.env.AI_PROVIDER || "openai") as AIProvider;
  const envModel = process.env.AI_MODEL || PROVIDER_DEFAULTS[envProvider]?.defaultModel || "gpt-4o";
  return resolveModel({ provider: envProvider, model: envModel });
}

/**
 * Resolve a model using DB-stored settings (with env fallback).
 * This is the primary entry point — use this in all server-side code.
 */
export async function resolveModelFromSettings(): Promise<LanguageModelV1> {
  const config = await getEffectiveAIConfig();

  const modelStr = config.model || "";
  if (modelStr) {
    const { provider, model } = parseModelString(modelStr);
    return resolveModel({
      provider,
      model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || undefined,
    });
  }

  const provider = (config.provider || "openai") as AIProvider;
  const defaults = PROVIDER_DEFAULTS[provider];
  return resolveModel({
    provider,
    model: defaults?.defaultModel || "gpt-4o",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl || undefined,
  });
}

/**
 * Get the list of all supported providers with their default models.
 */
export function getProviderList() {
  return Object.entries(PROVIDER_DEFAULTS).map(([id, config]) => ({
    id: id as AIProvider,
    defaultModel: config.defaultModel,
    envKey: config.envKey,
    baseUrl: config.baseUrl,
  }));
}
