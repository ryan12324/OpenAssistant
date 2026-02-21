import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetEffectiveAIConfig, mockLog } = vi.hoisted(() => ({
  mockGetEffectiveAIConfig: vi.fn(),
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/settings", () => ({
  getEffectiveAIConfig: (...args: unknown[]) => mockGetEffectiveAIConfig(...args),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/settings/effective", {
    method: "GET",
    headers,
  });
}

describe("GET /api/settings/effective", () => {
  it("returns effective AI config when RAG_API_KEY is not set", async () => {
    const originalKey = process.env.RAG_API_KEY;
    delete process.env.RAG_API_KEY;

    const config = { provider: "openai", model: "gpt-4" };
    mockGetEffectiveAIConfig.mockResolvedValue(config);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(config);

    process.env.RAG_API_KEY = originalKey;
  });

  it("returns effective AI config with valid Bearer token", async () => {
    const originalKey = process.env.RAG_API_KEY;
    process.env.RAG_API_KEY = "test-rag-key";

    const config = { provider: "anthropic", model: "claude-3" };
    mockGetEffectiveAIConfig.mockResolvedValue(config);

    const req = makeRequest({ authorization: "Bearer test-rag-key" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(config);

    process.env.RAG_API_KEY = originalKey;
  });

  it("returns 401 when RAG_API_KEY is set but auth header is wrong", async () => {
    const originalKey = process.env.RAG_API_KEY;
    process.env.RAG_API_KEY = "test-rag-key";

    const req = makeRequest({ authorization: "Bearer wrong-key" });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(mockLog.warn).toHaveBeenCalledWith(
      "Unauthorized access attempt on GET /api/settings/effective",
      expect.objectContaining({ hasAuthHeader: true })
    );

    process.env.RAG_API_KEY = originalKey;
  });

  it("returns 401 when RAG_API_KEY is set but auth header is missing", async () => {
    const originalKey = process.env.RAG_API_KEY;
    process.env.RAG_API_KEY = "test-rag-key";

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(mockLog.warn).toHaveBeenCalledWith(
      "Unauthorized access attempt on GET /api/settings/effective",
      expect.objectContaining({ hasAuthHeader: false })
    );

    process.env.RAG_API_KEY = originalKey;
  });

  it("returns 500 when getEffectiveAIConfig fails", async () => {
    const originalKey = process.env.RAG_API_KEY;
    delete process.env.RAG_API_KEY;

    mockGetEffectiveAIConfig.mockRejectedValue(new Error("DB error"));

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
    expect(mockLog.error).toHaveBeenCalledWith(
      "Failed to fetch effective AI config",
      expect.any(Object)
    );

    process.env.RAG_API_KEY = originalKey;
  });

  it("returns 500 on non-Error throw", async () => {
    const originalKey = process.env.RAG_API_KEY;
    delete process.env.RAG_API_KEY;

    mockGetEffectiveAIConfig.mockRejectedValue("string error");

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });

    process.env.RAG_API_KEY = originalKey;
  });
});
