import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so references are available inside vi.mock factories
// (vi.mock calls are hoisted above all other code by vitest)
// ---------------------------------------------------------------------------

const { mockRequireSession, mockGetSettings, mockUpdateSettings, mockGetEffectiveAIConfig, mockLog, mockHandleApiError } =
  vi.hoisted(() => ({
    mockRequireSession: vi.fn(),
    mockGetSettings: vi.fn(),
    mockUpdateSettings: vi.fn(),
    mockGetEffectiveAIConfig: vi.fn(),
    mockLog: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    mockHandleApiError: vi.fn((error: unknown, context: string) => {
      if (error instanceof Error && error.message === "Unauthorized") {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }),
  }));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/settings", () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
  getEffectiveAIConfig: (...args: unknown[]) => mockGetEffectiveAIConfig(...args),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
  maskSecret: (v: unknown) => {
    if (typeof v !== "string" || v.length === 0) return "";
    if (v.length <= 8) return `${"*".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`;
    return `${"*".repeat(v.length - 4)}${v.slice(-4)}`;
  },
}));

vi.mock("@/lib/api-utils", () => ({
  handleApiError: (...args: unknown[]) => mockHandleApiError(...args),
}));

// ---------------------------------------------------------------------------
// Import the route handlers AFTER mocks are registered
// ---------------------------------------------------------------------------

import { GET, PATCH } from "../route";

// ---------------------------------------------------------------------------
// Helper: build a full AppSettings-like object with sensible defaults
// ---------------------------------------------------------------------------

function mockSettings(overrides: Record<string, unknown> = {}) {
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
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ========================== GET ===========================================

describe("GET /api/settings", () => {
  it("returns settings with all fields populated and API keys masked", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetSettings.mockResolvedValue(
      mockSettings({
        aiProvider: "openai",
        aiModel: "gpt-4",
        openaiBaseUrl: "https://api.openai.com",
        openaiApiKey: "sk-abc12345678",
        anthropicApiKey: "sk-ant-999888",
        googleAiApiKey: "AIza1234",
        mistralApiKey: "mist5678",
        xaiApiKey: "xai-abcd",
        deepseekApiKey: "ds-longkey1234",
        moonshotApiKey: "ms-key1",
        openrouterApiKey: "or-key12",
        perplexityApiKey: "pp-key123",
        minimaxApiKey: "mm-key1234",
        glmApiKey: "glm-key12345",
        huggingfaceApiKey: "hf-longapikey9999",
        vercelAiGatewayKey: "vag-key-abcdef",
        embeddingProvider: "openai",
        embeddingModel: "text-embedding-3-small",
        embeddingApiKey: "sk-embed1234",
        embeddingBaseUrl: "https://embed.example.com",
      }),
    );

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);

    // Non-masked string fields come through as-is
    expect(json.aiProvider).toBe("openai");
    expect(json.aiModel).toBe("gpt-4");
    expect(json.openaiBaseUrl).toBe("https://api.openai.com");
    expect(json.embeddingProvider).toBe("openai");
    expect(json.embeddingModel).toBe("text-embedding-3-small");
    expect(json.embeddingBaseUrl).toBe("https://embed.example.com");

    // Masked keys: last 4 chars visible, rest replaced with *
    expect(json.openaiApiKey).toBe("**********5678");       // 14 chars -> 10 stars + "5678"
    expect(json.anthropicApiKey).toBe("*********9888");      // 13 chars -> 9 stars + "9888"
    expect(json.googleAiApiKey).toBe("****1234");            // 8 chars -> 4 stars + "1234"
    expect(json.mistralApiKey).toBe("****5678");             // 8 chars -> 4 stars + "5678"
    expect(json.xaiApiKey).toBe("****abcd");                 // 8 chars -> 4 stars + "abcd"
    expect(json.deepseekApiKey).toBe("**********1234");      // 14 chars -> 10 stars + "1234"
    expect(json.moonshotApiKey).toBe("***key1");             // 7 chars -> 3 stars + "key1"
    expect(json.openrouterApiKey).toBe("****ey12");          // 8 chars -> 4 stars + "ey12"
    expect(json.perplexityApiKey).toBe("*****y123");         // 9 chars -> 5 stars + "y123"
    expect(json.minimaxApiKey).toBe("******1234");           // 10 chars -> 6 stars + "1234"
    expect(json.glmApiKey).toBe("********2345");             // 12 chars -> 8 stars + "2345"
    expect(json.huggingfaceApiKey).toBe("*************9999"); // 17 chars -> 13 stars + "9999"
    expect(json.vercelAiGatewayKey).toBe("**********cdef");  // 14 chars -> 10 stars + "cdef"
    expect(json.embeddingApiKey).toBe("********1234");       // 12 chars -> 8 stars + "1234"
  });

  it("returns empty strings for all null fields", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-2" } });
    mockGetSettings.mockResolvedValue(mockSettings());

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);

    // All string fields default to ""
    expect(json.aiProvider).toBe("");
    expect(json.aiModel).toBe("");
    expect(json.openaiBaseUrl).toBe("");
    expect(json.embeddingProvider).toBe("");
    expect(json.embeddingModel).toBe("");
    expect(json.embeddingBaseUrl).toBe("");

    // All masked key fields return "" for null values
    expect(json.openaiApiKey).toBe("");
    expect(json.anthropicApiKey).toBe("");
    expect(json.googleAiApiKey).toBe("");
    expect(json.mistralApiKey).toBe("");
    expect(json.xaiApiKey).toBe("");
    expect(json.deepseekApiKey).toBe("");
    expect(json.moonshotApiKey).toBe("");
    expect(json.openrouterApiKey).toBe("");
    expect(json.perplexityApiKey).toBe("");
    expect(json.minimaxApiKey).toBe("");
    expect(json.glmApiKey).toBe("");
    expect(json.huggingfaceApiKey).toBe("");
    expect(json.vercelAiGatewayKey).toBe("");
    expect(json.embeddingApiKey).toBe("");
  });

  it("masks short keys (length <= 4) correctly", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-3" } });
    mockGetSettings.mockResolvedValue(
      mockSettings({
        openaiApiKey: "abcd",    // exactly 4 chars -> 0 stars + "abcd"
        anthropicApiKey: "ab",   // 2 chars -> 0 stars (max(0, -2)=0) + "ab"
        googleAiApiKey: "a",     // 1 char -> 0 stars + "a"
      }),
    );

    const res = await GET();
    const json = await res.json();

    expect(json.openaiApiKey).toBe("abcd");       // 4 chars: Math.max(0,0)=0 stars + "abcd"
    expect(json.anthropicApiKey).toBe("ab");       // 2 chars: Math.max(0,-2)=0 stars + "ab"
    expect(json.googleAiApiKey).toBe("a");         // 1 char: Math.max(0,-3)=0 stars + "a"
  });

  it("masks long keys showing stars prefix and last 4 chars", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-4" } });
    mockGetSettings.mockResolvedValue(
      mockSettings({
        openaiApiKey: "sk-1234567890abcdef", // 19 chars -> 15 stars + "cdef"
      }),
    );

    const res = await GET();
    const json = await res.json();

    expect(json.openaiApiKey).toBe("***************cdef");
  });

  it("returns 401 when requireSession throws Unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(mockHandleApiError).toHaveBeenCalledWith(
      expect.any(Error),
      "GET /api/settings",
    );
  });

  it("returns 500 when a generic error is thrown", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB connection lost"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
    expect(mockHandleApiError).toHaveBeenCalledWith(
      expect.any(Error),
      "GET /api/settings",
    );
  });

  it("returns 500 when a non-Error is thrown", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-5" } });
    mockGetSettings.mockRejectedValue("something went wrong");

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});

// ========================== PATCH =========================================

describe("PATCH /api/settings", () => {
  function makeRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("updates allowed fields and converts empty strings to null", async () => {
    const updatedAt = new Date("2025-06-15T10:30:00Z");
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockUpdateSettings.mockResolvedValue({ updatedAt });

    const req = makeRequest({
      aiProvider: "anthropic",
      aiModel: "",              // empty string -> null
      openaiApiKey: "sk-new-key-12345",
      anthropicApiKey: "",      // empty string -> null
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ status: "ok", updatedAt: updatedAt.toISOString() });

    // Verify updateSettings was called with correct data
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      aiProvider: "anthropic",
      aiModel: null,            // converted from ""
      openaiApiKey: "sk-new-key-12345",
      anthropicApiKey: null,    // converted from ""
    });
  });

  it("ignores disallowed fields in the request body", async () => {
    const updatedAt = new Date("2025-06-15T12:00:00Z");
    mockRequireSession.mockResolvedValue({ user: { id: "user-2" } });
    mockUpdateSettings.mockResolvedValue({ updatedAt });

    const req = makeRequest({
      aiProvider: "openai",
      hackerField: "malicious",
      id: "should-not-pass",
      updatedAt: "should-not-pass",
      __proto__: "evil",
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("ok");

    // Only the allowed field should be passed
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      aiProvider: "openai",
    });
  });

  it("returns updatedAt in the response", async () => {
    const updatedAt = new Date("2025-07-20T08:00:00Z");
    mockRequireSession.mockResolvedValue({ user: { id: "user-3" } });
    mockUpdateSettings.mockResolvedValue({ updatedAt });

    const req = makeRequest({ aiModel: "claude-3-opus" });

    const res = await PATCH(req);
    const json = await res.json();

    expect(json.updatedAt).toBe(updatedAt.toISOString());
  });

  it("returns 401 when requireSession throws Unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makeRequest({ aiProvider: "openai" });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(mockHandleApiError).toHaveBeenCalledWith(
      expect.any(Error),
      "PATCH /api/settings",
    );
  });

  it("returns 500 when a generic error is thrown", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-4" } });
    mockUpdateSettings.mockRejectedValue(new Error("DB write failed"));

    const req = makeRequest({ aiProvider: "openai" });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
    expect(mockHandleApiError).toHaveBeenCalledWith(
      expect.any(Error),
      "PATCH /api/settings",
    );
  });

  it("returns 500 when a non-Error is thrown", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-5" } });
    mockUpdateSettings.mockRejectedValue("unexpected failure");

    const req = makeRequest({ aiProvider: "openai" });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("handles all allowed fields being present in the body", async () => {
    const updatedAt = new Date("2025-08-01T00:00:00Z");
    mockRequireSession.mockResolvedValue({ user: { id: "user-6" } });
    mockUpdateSettings.mockResolvedValue({ updatedAt });

    const body: Record<string, string> = {
      aiProvider: "openai",
      aiModel: "gpt-4",
      openaiBaseUrl: "https://api.openai.com",
      openaiApiKey: "sk-key",
      anthropicApiKey: "ant-key",
      googleAiApiKey: "goog-key",
      mistralApiKey: "mist-key",
      xaiApiKey: "xai-key",
      deepseekApiKey: "ds-key",
      moonshotApiKey: "ms-key",
      openrouterApiKey: "or-key",
      perplexityApiKey: "pp-key",
      minimaxApiKey: "mm-key",
      glmApiKey: "glm-key",
      huggingfaceApiKey: "hf-key",
      vercelAiGatewayKey: "vag-key",
      embeddingProvider: "openai",
      embeddingModel: "text-embedding-3-small",
      embeddingApiKey: "emb-key",
      embeddingBaseUrl: "https://embed.example.com",
    };

    const req = makeRequest(body);
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("ok");

    // All 20 allowed fields should be passed through
    const passedData = mockUpdateSettings.mock.calls[0][0];
    expect(Object.keys(passedData)).toHaveLength(20);
    expect(passedData).toEqual(body);
  });
});
