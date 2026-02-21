import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLog } = vi.hoisted(() => ({
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("returns health data when RAG server is reachable", async () => {
    const healthData = { status: "ok", lightrag: true, rag_anything: true };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(healthData), { status: 200 })
    );

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(healthData);
  });

  it("uses RAG_SERVER_URL environment variable when set", async () => {
    const originalEnv = process.env.RAG_SERVER_URL;
    process.env.RAG_SERVER_URL = "http://custom-rag:9000";

    const healthData = { status: "ok" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(healthData), { status: 200 })
    );

    const res = await GET();
    await res.json();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://custom-rag:9000/health",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    process.env.RAG_SERVER_URL = originalEnv;
  });

  it("uses HEALTH_CHECK_TIMEOUT environment variable when set", async () => {
    const originalTimeout = process.env.HEALTH_CHECK_TIMEOUT;
    process.env.HEALTH_CHECK_TIMEOUT = "5000";

    const healthData = { status: "ok" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(healthData), { status: 200 })
    );

    const res = await GET();
    await res.json();

    expect(res.status).toBe(200);
    expect(mockLog.debug).toHaveBeenCalledWith(
      "Health check started",
      expect.objectContaining({ timeout: 5000 })
    );

    process.env.HEALTH_CHECK_TIMEOUT = originalTimeout;
  });

  it("returns error status when RAG server is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Connection refused"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      status: "error",
      lightrag: false,
      rag_anything: false,
      message: "RAG server unreachable",
    });
    expect(mockLog.warn).toHaveBeenCalledWith(
      "Health check failed: RAG server unreachable",
      expect.any(Object)
    );
  });

  it("returns error status when fetch times out", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Aborted", "AbortError"));

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual({
      status: "error",
      lightrag: false,
      rag_anything: false,
      message: "RAG server unreachable",
    });
  });
});
