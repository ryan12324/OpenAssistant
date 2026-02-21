import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockRoute, mockPresetRouters, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockRoute: vi.fn(),
  mockPresetRouters: [
    { id: "general-router", name: "General Router" },
    { id: "code-router", name: "Code Router" },
  ],
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/agents", () => ({
  AgentRouter: class MockAgentRouter {
    constructor(public definition: unknown) {}
    route = mockRoute;
  },
  presetRouters: mockPresetRouters,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/agents/router", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/agents/router", () => {
  it("routes a message to the default router", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const routeResult = { agentId: "code-agent", confidence: 0.95 };
    mockRoute.mockResolvedValue(routeResult);

    const req = makeRequest({ message: "Write some code" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(routeResult);
  });

  it("routes to a specific router when routerId is provided", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockRoute.mockResolvedValue({ agentId: "code-agent" });

    const req = makeRequest({ routerId: "code-router", message: "Fix bug" });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
  });

  it("passes context to the router", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockRoute.mockResolvedValue({ agentId: "agent-1" });

    const req = makeRequest({ message: "hello", context: "additional context" });
    await POST(req as any);

    expect(mockRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "hello",
        context: "additional context",
        userId: "user-1",
      })
    );
  });

  it("returns 400 when message is missing", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({});
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Message is required" });
  });

  it("returns 404 when router not found", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({ routerId: "nonexistent", message: "hello" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Router not found" });
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makeRequest({ message: "hello" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const req = makeRequest({ message: "hello" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 on non-Error throw", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockRoute.mockRejectedValue("string error");

    const req = makeRequest({ message: "hello" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("logs fallback routerId 'general-router' when routerId is not provided and router not found", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    // Clear the preset routers so default "general-router" is not found
    mockPresetRouters.length = 0;

    const req = makeRequest({ message: "hello" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Router not found" });
    expect(mockLog.warn).toHaveBeenCalledWith("Router not found", { routerId: "general-router" });

    // Restore preset routers for other tests
    mockPresetRouters.push(
      { id: "general-router", name: "General Router" },
      { id: "code-router", name: "Code Router" }
    );
  });
});
