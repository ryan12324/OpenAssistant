import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockGetProviderList, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockGetProviderList: vi.fn(),
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/ai/providers", () => ({
  getProviderList: (...args: unknown[]) => mockGetProviderList(...args),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/ai/providers", () => {
  it("returns list of providers with configured status", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderList.mockReturnValue([
      { id: "openai", defaultModel: "gpt-4", envKey: "OPENAI_API_KEY" },
      { id: "anthropic", defaultModel: "claude-3", envKey: "ANTHROPIC_API_KEY" },
      { id: "local", defaultModel: "llama", envKey: null },
    ]);

    // Set env for openai but not anthropic
    const origOpenai = process.env.OPENAI_API_KEY;
    const origAnthropic = process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.ANTHROPIC_API_KEY;

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.providers).toHaveLength(3);
    expect(json.providers[0]).toEqual({
      id: "openai",
      defaultModel: "gpt-4",
      configured: true,
    });
    expect(json.providers[1]).toEqual({
      id: "anthropic",
      defaultModel: "claude-3",
      configured: false,
    });
    expect(json.providers[2]).toEqual({
      id: "local",
      defaultModel: "llama",
      configured: true, // no envKey means always configured
    });

    process.env.OPENAI_API_KEY = origOpenai;
    if (origAnthropic !== undefined) {
      process.env.ANTHROPIC_API_KEY = origAnthropic;
    }
  });

  it("returns providers with envKey undefined treated as configured", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderList.mockReturnValue([
      { id: "builtin", defaultModel: "builtin-1", envKey: undefined },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(json.providers[0].configured).toBe(true);
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 on non-Error throw", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockGetProviderList.mockImplementation(() => {
      throw "string error";
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});
