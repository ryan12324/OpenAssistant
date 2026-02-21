import {
  resolveModel,
  validateModelConfig,
  resolveModelFromSettings,
  sanitizeBaseUrl,
  getProviderList,
  PROVIDER_DEFAULTS,
  type AIProvider,
  type ModelConfig,
} from "@/lib/ai/providers";

// ---------------------------------------------------------------------------
// Mocks  (vi.hoisted ensures these exist before the hoisted vi.mock calls)
// ---------------------------------------------------------------------------

const { mockModelInstance, mockClientFactory, mockLog } = vi.hoisted(() => {
  const mockModelInstance = { modelId: "mock-model" } as any;
  const mockClientFactory = vi.fn(() => mockModelInstance);
  const mockLog = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  return { mockModelInstance, mockClientFactory, mockLog };
});

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => mockClientFactory),
}));

vi.mock("@/lib/settings", () => ({
  getEffectiveAIConfig: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => mockLog),
  maskSecret: vi.fn((val: string) => `masked(${val})`),
}));

// Re-import mocked modules so we can control return values
import { createOpenAI } from "@ai-sdk/openai";
import { getEffectiveAIConfig } from "@/lib/settings";
import { maskSecret } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const savedEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string) {
  savedEnv[key] = process.env[key];
  process.env[key] = value;
}

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  // Clear the saved map for next test
  for (const key of Object.keys(savedEnv)) {
    delete savedEnv[key];
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockClientFactory.mockReturnValue(mockModelInstance);
});

afterEach(() => {
  restoreEnv();
});

// ===========================================================================
// resolveModel
// ===========================================================================
describe("resolveModel", () => {
  it("throws for an unknown provider", () => {
    const config: ModelConfig = {
      provider: "nonexistent" as AIProvider,
      model: "some-model",
    };

    expect(() => resolveModel(config)).toThrow("Unknown AI provider: nonexistent");
    expect(mockLog.error).toHaveBeenCalledWith("Unknown AI provider requested", {
      provider: "nonexistent",
    });
  });

  it("uses config.baseUrl when provided", () => {
    const config: ModelConfig = {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-test",
      baseUrl: "https://custom.example.com/v1",
    };

    const result = resolveModel(config);

    expect(createOpenAI).toHaveBeenCalledWith({
      baseURL: "https://custom.example.com/v1",
      apiKey: "sk-test",
    });
    expect(mockClientFactory).toHaveBeenCalledWith("gpt-4o");
    expect(result).toBe(mockModelInstance);
  });

  it("falls back to defaults.baseUrl when config.baseUrl is not set", () => {
    const config: ModelConfig = {
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      apiKey: "sk-ant-test",
    };

    resolveModel(config);

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://api.anthropic.com/v1",
      })
    );
  });

  it("uses config.apiKey when provided", () => {
    const config: ModelConfig = {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "my-custom-key",
    };

    resolveModel(config);

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "my-custom-key",
      })
    );
  });

  it("falls back to env var for apiKey when config.apiKey is not set", () => {
    setEnv("OPENAI_API_KEY", "env-key-123");

    const config: ModelConfig = {
      provider: "openai",
      model: "gpt-4o",
    };

    resolveModel(config);

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "env-key-123",
      })
    );
  });

  it("falls back to empty string for providers with no envKey (e.g., ollama)", () => {
    // ollama has envKey: ""
    const config: ModelConfig = {
      provider: "ollama",
      model: "llama3.1",
    };

    resolveModel(config);

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "",
      })
    );
  });

  it("uses config.model when set", () => {
    const config: ModelConfig = {
      provider: "openai",
      model: "gpt-3.5-turbo",
      apiKey: "key",
    };

    resolveModel(config);

    expect(mockClientFactory).toHaveBeenCalledWith("gpt-3.5-turbo");
  });

  it("falls back to defaultModel when config.model is empty", () => {
    const config: ModelConfig = {
      provider: "mistral",
      model: "",
      apiKey: "key",
    };

    resolveModel(config);

    expect(mockClientFactory).toHaveBeenCalledWith("mistral-large-latest");
  });

  it("logs the resolved model information with masked API key", () => {
    const config: ModelConfig = {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-secret-key",
    };

    resolveModel(config);

    expect(maskSecret).toHaveBeenCalledWith("sk-secret-key");
    expect(mockLog.info).toHaveBeenCalledWith("Resolving AI model", {
      provider: "openai",
      modelId: "gpt-4o",
      baseURL: "https://api.openai.com/v1",
      apiKey: "masked(sk-secret-key)",
    });
  });
});

// ===========================================================================
// validateModelConfig
// ===========================================================================
describe("validateModelConfig", () => {
  it("throws for an unknown provider", () => {
    const config: ModelConfig = {
      provider: "nonexistent" as AIProvider,
      model: "some-model",
    };

    expect(() => validateModelConfig(config)).toThrow("Unknown AI provider: nonexistent");
    expect(mockLog.error).toHaveBeenCalledWith("Unknown AI provider requested", {
      provider: "nonexistent",
    });
  });

  it("returns resolved baseURL, apiKey, and modelId for a valid provider", () => {
    const config: ModelConfig = {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-test",
      baseUrl: "https://custom.example.com/v1",
    };

    const result = validateModelConfig(config);

    expect(result).toEqual({
      baseURL: "https://custom.example.com/v1",
      apiKey: "sk-test",
      modelId: "gpt-4o",
    });
  });

  it("falls back to provider defaults when config values are not provided", () => {
    const config: ModelConfig = {
      provider: "anthropic",
      model: "",
    };

    const result = validateModelConfig(config);

    expect(result.baseURL).toBe("https://api.anthropic.com/v1");
    expect(result.modelId).toBe("claude-sonnet-4-5-20250929");
  });

  it("falls back to env var for apiKey when config.apiKey is not set", () => {
    setEnv("OPENAI_API_KEY", "env-key-from-validate");

    const config: ModelConfig = {
      provider: "openai",
      model: "gpt-4o",
    };

    const result = validateModelConfig(config);

    expect(result.apiKey).toBe("env-key-from-validate");
  });

  it("returns empty string for apiKey for providers with no envKey (e.g., ollama)", () => {
    const config: ModelConfig = {
      provider: "ollama",
      model: "llama3.1",
    };

    const result = validateModelConfig(config);

    expect(result.apiKey).toBe("");
  });
});

// ===========================================================================
// resolveModelFromSettings
// ===========================================================================
describe("resolveModelFromSettings", () => {
  it("defaults provider to 'openai' when config.provider is empty", async () => {
    vi.mocked(getEffectiveAIConfig).mockResolvedValue({
      provider: "",
      model: "gpt-4o",
      apiKey: "key-123",
      baseUrl: "",
      embeddingProvider: "",
      embeddingModel: "",
      embeddingApiKey: "",
      embeddingBaseUrl: "",
    });

    const result = await resolveModelFromSettings();

    expect(result).toBe(mockModelInstance);
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://api.openai.com/v1",
        apiKey: "key-123",
      })
    );
    expect(mockClientFactory).toHaveBeenCalledWith("gpt-4o");
  });

  it("resolves model when modelStr is set in settings", async () => {
    vi.mocked(getEffectiveAIConfig).mockResolvedValue({
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      apiKey: "ant-key",
      baseUrl: "",
      embeddingProvider: "",
      embeddingModel: "",
      embeddingApiKey: "",
      embeddingBaseUrl: "",
    });

    const result = await resolveModelFromSettings();

    expect(result).toBe(mockModelInstance);
    expect(mockLog.info).toHaveBeenCalledWith(
      "Resolved model from settings",
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
      })
    );
    expect(mockClientFactory).toHaveBeenCalledWith("claude-sonnet-4-5-20250929");
  });

  it("falls back to provider default model when modelStr is empty", async () => {
    vi.mocked(getEffectiveAIConfig).mockResolvedValue({
      provider: "google",
      model: "",
      apiKey: "google-key",
      baseUrl: "",
      embeddingProvider: "",
      embeddingModel: "",
      embeddingApiKey: "",
      embeddingBaseUrl: "",
    });

    const result = await resolveModelFromSettings();

    expect(result).toBe(mockModelInstance);
    expect(mockLog.debug).toHaveBeenCalledWith(
      "No model string in settings, falling back to provider default",
      { provider: "google" }
    );
    expect(mockClientFactory).toHaveBeenCalledWith("gemini-2.5-pro");
  });

  it("uses sanitized baseUrl from settings", async () => {
    vi.mocked(getEffectiveAIConfig).mockResolvedValue({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "key",
      baseUrl: "https://my-custom-proxy.example.com/v1",
      embeddingProvider: "",
      embeddingModel: "",
      embeddingApiKey: "",
      embeddingBaseUrl: "",
    });

    await resolveModelFromSettings();

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://my-custom-proxy.example.com/v1",
      })
    );
  });

  it("logs initial debug message", async () => {
    vi.mocked(getEffectiveAIConfig).mockResolvedValue({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "",
      baseUrl: "",
      embeddingProvider: "",
      embeddingModel: "",
      embeddingApiKey: "",
      embeddingBaseUrl: "",
    });

    await resolveModelFromSettings();

    expect(mockLog.debug).toHaveBeenCalledWith("Resolving model from settings");
  });

  it("falls back to 'gpt-4o' when provider is unknown and has no defaults entry", async () => {
    // configProvider is cast to AIProvider but the DB can store arbitrary strings.
    // When the provider is not in PROVIDER_DEFAULTS, defaults?.defaultModel is
    // undefined, so the fallback "gpt-4o" is used as the model string.
    // resolveModel will then throw because the provider is unknown.
    vi.mocked(getEffectiveAIConfig).mockResolvedValue({
      provider: "unknown-provider",
      model: "",
      apiKey: "",
      baseUrl: "",
      embeddingProvider: "",
      embeddingModel: "",
      embeddingApiKey: "",
      embeddingBaseUrl: "",
    });

    await expect(resolveModelFromSettings()).rejects.toThrow(
      "Unknown AI provider: unknown-provider"
    );
  });
});

// ===========================================================================
// sanitizeBaseUrl
// ===========================================================================
describe("sanitizeBaseUrl", () => {
  it("returns undefined for null input", () => {
    expect(sanitizeBaseUrl(null, "openai")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(sanitizeBaseUrl(undefined, "openai")).toBeUndefined();
  });

  it("returns undefined for empty string input", () => {
    expect(sanitizeBaseUrl("", "openai")).toBeUndefined();
  });

  it("returns undefined when URL matches the current provider default", () => {
    const result = sanitizeBaseUrl("https://api.openai.com/v1", "openai");

    expect(result).toBeUndefined();
    expect(mockLog.debug).toHaveBeenCalledWith(
      "Base URL matches current provider default, ignoring",
      { provider: "openai", baseUrl: "https://api.openai.com/v1" }
    );
  });

  it("returns undefined when URL matches a different provider default (stale URL)", () => {
    const result = sanitizeBaseUrl("https://api.openai.com/v1", "vercel");

    expect(result).toBeUndefined();
    expect(mockLog.warn).toHaveBeenCalledWith(
      "Discarding stale base URL from previous provider",
      {
        storedUrl: "https://api.openai.com/v1",
        matchedProvider: "openai",
        currentProvider: "vercel",
      }
    );
  });

  it("returns the custom URL when it does not match any provider default", () => {
    const customUrl = "https://my-proxy.example.com/v1";
    const result = sanitizeBaseUrl(customUrl, "openai");

    expect(result).toBe(customUrl);
    expect(mockLog.debug).toHaveBeenCalledWith("Using custom base URL override", {
      provider: "openai",
      baseUrl: customUrl,
    });
  });

  // Bug fix test: switching from openai to vercel with stale openai baseUrl
  it("discards stale openai baseUrl when switching to vercel provider", () => {
    const staleUrl = "https://api.openai.com/v1";
    const result = sanitizeBaseUrl(staleUrl, "vercel");

    expect(result).toBeUndefined();
    expect(mockLog.warn).toHaveBeenCalledWith(
      "Discarding stale base URL from previous provider",
      {
        storedUrl: staleUrl,
        matchedProvider: "openai",
        currentProvider: "vercel",
      }
    );
  });

  it("discards stale anthropic baseUrl when switching to openai provider", () => {
    const staleUrl = "https://api.anthropic.com/v1";
    const result = sanitizeBaseUrl(staleUrl, "openai");

    expect(result).toBeUndefined();
    expect(mockLog.warn).toHaveBeenCalledWith(
      "Discarding stale base URL from previous provider",
      {
        storedUrl: staleUrl,
        matchedProvider: "anthropic",
        currentProvider: "openai",
      }
    );
  });
});

// ===========================================================================
// getProviderList
// ===========================================================================
describe("getProviderList", () => {
  it("returns the correct number of providers", () => {
    const list = getProviderList();

    expect(list).toHaveLength(Object.keys(PROVIDER_DEFAULTS).length);
  });

  it("returns entries with the correct shape including name field", () => {
    const list = getProviderList();

    for (const entry of list) {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("defaultModel");
      expect(entry).toHaveProperty("envKey");
      expect(entry).toHaveProperty("baseUrl");
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.defaultModel).toBe("string");
      expect(typeof entry.envKey).toBe("string");
      expect(typeof entry.baseUrl).toBe("string");
      // name should match id
      expect(entry.name).toBe(entry.id);
    }
  });

  it("includes known providers with correct default models", () => {
    const list = getProviderList();
    const lookup = Object.fromEntries(list.map((e) => [e.id, e]));

    expect(lookup["openai"].defaultModel).toBe("gpt-4o");
    expect(lookup["anthropic"].defaultModel).toBe("claude-sonnet-4-5-20250929");
    expect(lookup["google"].defaultModel).toBe("gemini-2.5-pro");
    expect(lookup["ollama"].defaultModel).toBe("llama3.1");
    expect(lookup["vercel"].defaultModel).toBe("openai/gpt-4o");
  });

  it("logs the provider count", () => {
    getProviderList();

    expect(mockLog.debug).toHaveBeenCalledWith("Returning provider list", {
      providerCount: Object.keys(PROVIDER_DEFAULTS).length,
    });
  });
});

// ===========================================================================
// PROVIDER_DEFAULTS export
// ===========================================================================
describe("PROVIDER_DEFAULTS", () => {
  it("contains all expected providers", () => {
    const expectedProviders: AIProvider[] = [
      "openai", "anthropic", "google", "mistral", "xai", "deepseek",
      "moonshot", "openrouter", "perplexity", "ollama", "lmstudio",
      "minimax", "glm", "huggingface", "vercel",
    ];

    for (const provider of expectedProviders) {
      expect(PROVIDER_DEFAULTS).toHaveProperty(provider);
      expect(PROVIDER_DEFAULTS[provider]).toHaveProperty("baseUrl");
      expect(PROVIDER_DEFAULTS[provider]).toHaveProperty("defaultModel");
      expect(PROVIDER_DEFAULTS[provider]).toHaveProperty("envKey");
    }
  });

  it("uses default base URL for ollama when OLLAMA_BASE_URL env is not set", () => {
    // OLLAMA_BASE_URL is read at module load time; if not set, defaults apply
    expect(PROVIDER_DEFAULTS.ollama.baseUrl).toBe(
      process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1"
    );
  });

  it("uses default base URL for lmstudio when LMSTUDIO_BASE_URL env is not set", () => {
    // LMSTUDIO_BASE_URL is read at module load time; if not set, defaults apply
    expect(PROVIDER_DEFAULTS.lmstudio.baseUrl).toBe(
      process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1"
    );
  });
});

// ===========================================================================
// Integration-style: resolveModelFromSettings with stale baseUrl (bug fix)
// ===========================================================================
describe("resolveModelFromSettings with stale baseUrl (bug fix scenario)", () => {
  it("correctly discards stale openai baseUrl when provider is switched to vercel", async () => {
    // Simulate: user previously had openai, switched to vercel, but baseUrl
    // in DB still holds "https://api.openai.com/v1"
    vi.mocked(getEffectiveAIConfig).mockResolvedValue({
      provider: "vercel",
      model: "openai/gpt-4o",
      apiKey: "vercel-key",
      baseUrl: "https://api.openai.com/v1", // stale!
      embeddingProvider: "",
      embeddingModel: "",
      embeddingApiKey: "",
      embeddingBaseUrl: "",
    });

    await resolveModelFromSettings();

    // The stale openai base URL should have been discarded, so resolveModel
    // should receive undefined for baseUrl and fall back to vercel's default
    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://gateway.ai.vercel.app/v1",
      })
    );
    expect(mockClientFactory).toHaveBeenCalledWith("openai/gpt-4o");
  });
});
