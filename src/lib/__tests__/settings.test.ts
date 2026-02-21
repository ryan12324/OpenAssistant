import type { AppSettings } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockFindUnique,
  mockCreate,
  mockUpsert,
  mockDebug,
  mockInfo,
  mockMaskSecret,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpsert: vi.fn(),
  mockDebug: vi.fn(),
  mockInfo: vi.fn(),
  mockMaskSecret: vi.fn((v: string) => (v ? "***" : "")),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSettings: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ debug: mockDebug, info: mockInfo }),
  maskSecret: (v: string) => mockMaskSecret(v),
}));

// ---------------------------------------------------------------------------
// Import SUT (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  getSettings,
  updateSettings,
  getEffectiveAIConfig,
  PROVIDER_KEY_COLUMN,
  type EffectiveAIConfig,
} from "@/lib/settings";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function mockSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    id: "singleton",
    aiProvider: null,
    aiModel: null,
    openaiApiKey: null,
    anthropicApiKey: null,
    googleAiApiKey: null,
    mistralApiKey: null,
    xaiApiKey: null,
    deepseekApiKey: null,
    moonshotApiKey: null,
    openrouterApiKey: null,
    perplexityApiKey: null,
    minimaxApiKey: null,
    glmApiKey: null,
    huggingfaceApiKey: null,
    vercelAiGatewayKey: null,
    openaiBaseUrl: null,
    embeddingProvider: null,
    embeddingModel: null,
    embeddingApiKey: null,
    embeddingBaseUrl: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Env var helpers
// ---------------------------------------------------------------------------

const ENV_KEYS_TO_CLEAN = [
  "AI_PROVIDER",
  "AI_MODEL",
  "OPENAI_BASE_URL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_AI_API_KEY",
  "MISTRAL_API_KEY",
  "XAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "MOONSHOT_API_KEY",
  "OPENROUTER_API_KEY",
  "PERPLEXITY_API_KEY",
  "MINIMAX_API_KEY",
  "GLM_API_KEY",
  "HUGGINGFACE_API_KEY",
  "VERCEL_AI_GATEWAY_KEY",
  "EMBEDDING_PROVIDER",
  "EMBEDDING_MODEL",
  "EMBEDDING_API_KEY",
  "EMBEDDING_BASE_URL",
  "DEFAULT_EMBEDDING_MODEL",
];

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  // Save current env values
  savedEnv = {};
  for (const key of ENV_KEYS_TO_CLEAN) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  // Restore env values
  for (const key of ENV_KEYS_TO_CLEAN) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PROVIDER_KEY_COLUMN", () => {
  it("maps all 13 providers to their correct DB column names", () => {
    expect(PROVIDER_KEY_COLUMN).toEqual({
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
    });
  });
});

describe("getSettings", () => {
  it("returns existing row when found in database", async () => {
    const row = mockSettings({ aiProvider: "anthropic" });
    mockFindUnique.mockResolvedValue(row);

    const result = await getSettings();

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "singleton" } });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toBe(row);
    expect(mockDebug).toHaveBeenCalledWith("Fetching settings from database");
    expect(mockDebug).toHaveBeenCalledWith("Settings loaded", {
      provider: "anthropic",
      model: null,
    });
  });

  it("creates a default singleton row when none exists", async () => {
    const created = mockSettings();
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(created);

    const result = await getSettings();

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "singleton" } });
    expect(mockCreate).toHaveBeenCalledWith({ data: { id: "singleton" } });
    expect(mockInfo).toHaveBeenCalledWith("No settings row found — creating default singleton");
    expect(result).toBe(created);
  });
});

describe("updateSettings", () => {
  it("upserts with provided data and returns the result", async () => {
    const data = { aiProvider: "mistral", aiModel: "mistral-large" };
    const updated = mockSettings({ ...data, updatedAt: new Date("2026-01-15") });
    mockUpsert.mockResolvedValue(updated);

    const result = await updateSettings(data);

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton", ...data },
      update: data,
    });
    expect(mockInfo).toHaveBeenCalledWith("Updating settings", {
      fields: ["aiProvider", "aiModel"],
    });
    expect(mockInfo).toHaveBeenCalledWith("Settings updated successfully", {
      updatedAt: updated.updatedAt,
    });
    expect(result).toBe(updated);
  });
});

describe("getEffectiveAIConfig", () => {
  // Helper to set up getSettings mock for getEffectiveAIConfig tests
  function setupSettings(overrides: Partial<AppSettings> = {}) {
    const row = mockSettings(overrides);
    mockFindUnique.mockResolvedValue(row);
    return row;
  }

  // -----------------------------------------------------------------------
  // Provider resolution
  // -----------------------------------------------------------------------

  describe("provider resolution", () => {
    it("uses provider from DB when set", async () => {
      setupSettings({ aiProvider: "anthropic" });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.provider).toBe("anthropic");
    });

    it("falls back to AI_PROVIDER env var when DB value is null", async () => {
      setupSettings({ aiProvider: null });
      process.env.AI_PROVIDER = "google";
      const cfg = await getEffectiveAIConfig();
      expect(cfg.provider).toBe("google");
    });

    it('defaults to "openai" when neither DB nor env is set', async () => {
      setupSettings({ aiProvider: null });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.provider).toBe("openai");
    });
  });

  // -----------------------------------------------------------------------
  // Model resolution
  // -----------------------------------------------------------------------

  describe("model resolution", () => {
    it("uses model from DB when set", async () => {
      setupSettings({ aiModel: "gpt-4o" });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.model).toBe("gpt-4o");
    });

    it("falls back to AI_MODEL env var when DB value is null", async () => {
      setupSettings({ aiModel: null });
      process.env.AI_MODEL = "gpt-3.5-turbo";
      const cfg = await getEffectiveAIConfig();
      expect(cfg.model).toBe("gpt-3.5-turbo");
    });

    it('defaults to "" when neither DB nor env is set', async () => {
      setupSettings({ aiModel: null });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.model).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // Base URL resolution
  // -----------------------------------------------------------------------

  describe("baseUrl resolution", () => {
    it("uses openaiBaseUrl from DB when set", async () => {
      setupSettings({ openaiBaseUrl: "https://custom.api/" });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.baseUrl).toBe("https://custom.api/");
    });

    it("falls back to OPENAI_BASE_URL env var when DB value is null", async () => {
      setupSettings({ openaiBaseUrl: null });
      process.env.OPENAI_BASE_URL = "https://env.api/";
      const cfg = await getEffectiveAIConfig();
      expect(cfg.baseUrl).toBe("https://env.api/");
    });

    it('defaults to "" when neither DB nor env is set', async () => {
      setupSettings({ openaiBaseUrl: null });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.baseUrl).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // API key resolution
  // -----------------------------------------------------------------------

  describe("API key resolution", () => {
    it("resolves API key from DB column (keySource = database)", async () => {
      setupSettings({ aiProvider: "openai", openaiApiKey: "sk-db-key" });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.apiKey).toBe("sk-db-key");
      expect(mockInfo).toHaveBeenCalledWith(
        "Effective AI config resolved",
        expect.objectContaining({ apiKeySource: "database" })
      );
    });

    it("falls back to env var when DB column is null (keySource = env)", async () => {
      setupSettings({ aiProvider: "anthropic", anthropicApiKey: null });
      process.env.ANTHROPIC_API_KEY = "sk-env-key";
      const cfg = await getEffectiveAIConfig();
      expect(cfg.apiKey).toBe("sk-env-key");
      expect(mockInfo).toHaveBeenCalledWith(
        "Effective AI config resolved",
        expect.objectContaining({ apiKeySource: "env" })
      );
    });

    it('returns "" and keySource "none" when no DB key and no env var', async () => {
      setupSettings({ aiProvider: "openai", openaiApiKey: null });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.apiKey).toBe("");
      expect(mockInfo).toHaveBeenCalledWith(
        "Effective AI config resolved",
        expect.objectContaining({ apiKeySource: "none" })
      );
    });

    it("handles unknown provider (col is undefined)", async () => {
      setupSettings({ aiProvider: "unknownprovider" });
      const cfg = await getEffectiveAIConfig();
      // col = undefined, dbKey = null, envKeyName = ""
      expect(cfg.apiKey).toBe("");
      expect(mockInfo).toHaveBeenCalledWith(
        "Effective AI config resolved",
        expect.objectContaining({ apiKeySource: "none" })
      );
    });
  });

  // -----------------------------------------------------------------------
  // maskSecret is called
  // -----------------------------------------------------------------------

  it("calls maskSecret with the resolved API key", async () => {
    setupSettings({ aiProvider: "openai", openaiApiKey: "sk-secret" });
    await getEffectiveAIConfig();
    expect(mockMaskSecret).toHaveBeenCalledWith("sk-secret");
  });

  // -----------------------------------------------------------------------
  // Embedding: provider not set (empty string)
  // -----------------------------------------------------------------------

  describe("embedding - provider not set", () => {
    it("falls back to LLM apiKey and baseUrl when embeddingProvider is empty", async () => {
      setupSettings({
        aiProvider: "openai",
        openaiApiKey: "sk-llm",
        openaiBaseUrl: "https://llm-base/",
      });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingProvider).toBe("");
      expect(cfg.embeddingApiKey).toBe("sk-llm");
      expect(cfg.embeddingBaseUrl).toBe("https://llm-base/");
      // log.debug for embedding should NOT be called when embeddingProvider is empty
      expect(mockDebug).not.toHaveBeenCalledWith(
        "Embedding config resolved",
        expect.anything()
      );
    });

    it("uses embeddingApiKey from DB even when provider is empty (same-provider branch)", async () => {
      setupSettings({
        aiProvider: "openai",
        openaiApiKey: "sk-llm",
        embeddingApiKey: "sk-emb-explicit",
      });
      const cfg = await getEffectiveAIConfig();
      // embeddingApiKey is already set, so it should NOT fall back to apiKey
      expect(cfg.embeddingApiKey).toBe("sk-emb-explicit");
    });

    it("uses embeddingBaseUrl from DB even when provider is empty (same-provider branch)", async () => {
      setupSettings({
        aiProvider: "openai",
        openaiBaseUrl: "https://llm-base/",
        embeddingBaseUrl: "https://emb-base/",
      });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingBaseUrl).toBe("https://emb-base/");
    });
  });

  // -----------------------------------------------------------------------
  // Embedding: provider same as LLM provider
  // -----------------------------------------------------------------------

  describe("embedding - same provider as LLM", () => {
    it("falls back to LLM apiKey and baseUrl", async () => {
      setupSettings({
        aiProvider: "openai",
        openaiApiKey: "sk-llm",
        openaiBaseUrl: "https://llm/",
        embeddingProvider: "openai",
      });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingProvider).toBe("openai");
      expect(cfg.embeddingApiKey).toBe("sk-llm");
      expect(cfg.embeddingBaseUrl).toBe("https://llm/");
      // log.debug for embedding SHOULD be called
      expect(mockDebug).toHaveBeenCalledWith(
        "Embedding config resolved",
        expect.objectContaining({ embeddingProvider: "openai" })
      );
    });
  });

  // -----------------------------------------------------------------------
  // Embedding: different provider
  // -----------------------------------------------------------------------

  describe("embedding - different provider", () => {
    it("resolves embeddingApiKey from embedding provider DB column when not explicitly set", async () => {
      setupSettings({
        aiProvider: "openai",
        openaiApiKey: "sk-llm",
        embeddingProvider: "anthropic",
        anthropicApiKey: "sk-emb-from-db",
      });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingApiKey).toBe("sk-emb-from-db");
    });

    it("resolves embeddingApiKey from embedding provider env var when DB column is null", async () => {
      setupSettings({
        aiProvider: "openai",
        openaiApiKey: "sk-llm",
        embeddingProvider: "google",
        googleAiApiKey: null,
      });
      process.env.GOOGLE_AI_API_KEY = "sk-emb-from-env";
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingApiKey).toBe("sk-emb-from-env");
    });

    it("keeps explicit embeddingApiKey when already set (does not resolve from provider)", async () => {
      setupSettings({
        aiProvider: "openai",
        openaiApiKey: "sk-llm",
        embeddingProvider: "anthropic",
        embeddingApiKey: "sk-explicit-emb",
        anthropicApiKey: "sk-should-not-use",
      });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingApiKey).toBe("sk-explicit-emb");
    });

    it("handles unknown embedding provider (no column mapping)", async () => {
      setupSettings({
        aiProvider: "openai",
        openaiApiKey: "sk-llm",
        embeddingProvider: "unknownemb",
      });
      const cfg = await getEffectiveAIConfig();
      // embCol is undefined, embDbKey is null, embEnvKeyName is ""
      expect(cfg.embeddingApiKey).toBe("");
    });

    it("does not inherit baseUrl from LLM provider", async () => {
      setupSettings({
        aiProvider: "openai",
        openaiApiKey: "sk-llm",
        openaiBaseUrl: "https://llm-base/",
        embeddingProvider: "anthropic",
        anthropicApiKey: "sk-emb",
      });
      const cfg = await getEffectiveAIConfig();
      // embeddingBaseUrl should remain "" since different provider branch
      // does NOT copy baseUrl from LLM
      expect(cfg.embeddingBaseUrl).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // Embedding model resolution
  // -----------------------------------------------------------------------

  describe("embedding model resolution", () => {
    it("uses embeddingModel from DB when set", async () => {
      setupSettings({ embeddingModel: "custom-embedding" });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingModel).toBe("custom-embedding");
    });

    it("falls back to EMBEDDING_MODEL env var", async () => {
      setupSettings({ embeddingModel: null });
      process.env.EMBEDDING_MODEL = "env-embedding";
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingModel).toBe("env-embedding");
    });

    it('defaults to "text-embedding-3-small" when no env vars are set', async () => {
      setupSettings({ embeddingModel: null });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingModel).toBe("text-embedding-3-small");
    });

    it("uses DEFAULT_EMBEDDING_MODEL env var when EMBEDDING_MODEL is not set", async () => {
      setupSettings({ embeddingModel: null });
      process.env.DEFAULT_EMBEDDING_MODEL = "custom-default-embedding";
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingModel).toBe("custom-default-embedding");
    });

    it("prefers EMBEDDING_MODEL over DEFAULT_EMBEDDING_MODEL", async () => {
      setupSettings({ embeddingModel: null });
      process.env.EMBEDDING_MODEL = "env-embedding";
      process.env.DEFAULT_EMBEDDING_MODEL = "custom-default-embedding";
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingModel).toBe("env-embedding");
    });
  });

  // -----------------------------------------------------------------------
  // Embedding provider resolution
  // -----------------------------------------------------------------------

  describe("embedding provider resolution", () => {
    it("uses embeddingProvider from DB when set", async () => {
      setupSettings({ embeddingProvider: "google" });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingProvider).toBe("google");
    });

    it("falls back to EMBEDDING_PROVIDER env var", async () => {
      setupSettings({ embeddingProvider: null });
      process.env.EMBEDDING_PROVIDER = "mistral";
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingProvider).toBe("mistral");
    });

    it('defaults to ""', async () => {
      setupSettings({ embeddingProvider: null });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingProvider).toBe("");
    });
  });

  // -----------------------------------------------------------------------
  // Embedding base URL resolution
  // -----------------------------------------------------------------------

  describe("embedding base URL resolution", () => {
    it("uses embeddingBaseUrl from DB", async () => {
      setupSettings({ embeddingBaseUrl: "https://emb-db/" });
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingBaseUrl).toBe("https://emb-db/");
    });

    it("falls back to EMBEDDING_BASE_URL env var", async () => {
      setupSettings({ embeddingBaseUrl: null });
      process.env.EMBEDDING_BASE_URL = "https://emb-env/";
      const cfg = await getEffectiveAIConfig();
      expect(cfg.embeddingBaseUrl).toBe("https://emb-env/");
    });
  });

  // -----------------------------------------------------------------------
  // Embedding API key from env (EMBEDDING_API_KEY)
  // -----------------------------------------------------------------------

  describe("embedding API key from EMBEDDING_API_KEY env", () => {
    it("uses EMBEDDING_API_KEY env when DB embeddingApiKey is null and provider differs", async () => {
      setupSettings({
        aiProvider: "openai",
        embeddingProvider: "anthropic",
        embeddingApiKey: null,
      });
      process.env.EMBEDDING_API_KEY = "sk-emb-env-direct";
      const cfg = await getEffectiveAIConfig();
      // embeddingApiKey was resolved from EMBEDDING_API_KEY env, so the
      // inner !embeddingApiKey check is false, and it keeps this value
      expect(cfg.embeddingApiKey).toBe("sk-emb-env-direct");
    });
  });

  // -----------------------------------------------------------------------
  // Full return shape
  // -----------------------------------------------------------------------

  it("returns a value matching the EffectiveAIConfig interface", async () => {
    setupSettings({ aiProvider: "openai", openaiApiKey: "sk-test" });
    const cfg: EffectiveAIConfig = await getEffectiveAIConfig();
    expect(cfg).toHaveProperty("provider");
    expect(cfg).toHaveProperty("model");
    expect(cfg).toHaveProperty("apiKey");
    expect(cfg).toHaveProperty("baseUrl");
    expect(cfg).toHaveProperty("embeddingProvider");
    expect(cfg).toHaveProperty("embeddingModel");
    expect(cfg).toHaveProperty("embeddingApiKey");
    expect(cfg).toHaveProperty("embeddingBaseUrl");
  });

  it("returns the full config shape with all fields", async () => {
    setupSettings({
      aiProvider: "xai",
      aiModel: "grok-2",
      openaiBaseUrl: "https://xai-base/",
      xaiApiKey: "sk-xai",
      embeddingProvider: "huggingface",
      embeddingModel: "bge-small",
      embeddingApiKey: "sk-hf",
      embeddingBaseUrl: "https://hf-base/",
    });
    const cfg = await getEffectiveAIConfig();
    expect(cfg).toEqual({
      provider: "xai",
      model: "grok-2",
      apiKey: "sk-xai",
      baseUrl: "https://xai-base/",
      embeddingProvider: "huggingface",
      embeddingModel: "bge-small",
      embeddingApiKey: "sk-hf",
      embeddingBaseUrl: "https://hf-base/",
    });
  });
});
