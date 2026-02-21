import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockIntegrationRegistry, mockPrisma, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockIntegrationRegistry: {
    getAllDefinitions: vi.fn(),
    getDefinition: vi.fn(),
    invalidateUser: vi.fn(),
    createUserInstance: vi.fn(),
  },
  mockPrisma: {
    skillConfig: { findMany: vi.fn(), upsert: vi.fn() },
  },
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/integrations", () => ({
  integrationRegistry: mockIntegrationRegistry,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { GET, POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
});

// ========================== GET ===========================================

describe("GET /api/integrations", () => {
  it("returns integrations with user config merged", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockIntegrationRegistry.getAllDefinitions.mockReturnValue([
      {
        id: "slack",
        name: "Slack",
        description: "Slack integration",
        category: "chat",
        icon: "slack.svg",
        website: "https://slack.com",
        configFields: [],
        skills: [],
        supportsInbound: true,
        supportsOutbound: true,
      },
      {
        id: "telegram",
        name: "Telegram",
        description: "Telegram integration",
        category: "chat",
        icon: "telegram.svg",
        website: "https://telegram.org",
        configFields: [],
        skills: [],
        supportsInbound: false,
      },
    ]);
    mockPrisma.skillConfig.findMany.mockResolvedValue([
      { skillId: "slack", enabled: true },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.integrations).toHaveLength(2);
    expect(json.integrations[0].enabled).toBe(true);
    expect(json.integrations[0].configured).toBe(true);
    expect(json.integrations[0].supportsInbound).toBe(true);
    expect(json.integrations[0].supportsOutbound).toBe(true);
    expect(json.integrations[1].enabled).toBe(false);
    expect(json.integrations[1].configured).toBe(false);
    expect(json.integrations[1].supportsInbound).toBe(false);
    expect(json.integrations[1].supportsOutbound).toBe(false);
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
    mockIntegrationRegistry.getAllDefinitions.mockImplementation(() => {
      throw "string error";
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});

// ========================== POST ==========================================

describe("POST /api/integrations", () => {
  function makeRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("saves integration config without connecting", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockIntegrationRegistry.getDefinition.mockReturnValue({ id: "slack" });
    mockPrisma.skillConfig.upsert.mockResolvedValue({});

    const req = makeRequest({ integrationId: "slack", enabled: true });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ status: "ok", integrationId: "slack", enabled: true });
    expect(mockIntegrationRegistry.invalidateUser).toHaveBeenCalledWith("user-1");
  });

  it("connects when enabled with config", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockIntegrationRegistry.getDefinition.mockReturnValue({ id: "slack" });
    mockPrisma.skillConfig.upsert.mockResolvedValue({});
    const mockInstance = { connect: vi.fn().mockResolvedValue(undefined) };
    mockIntegrationRegistry.createUserInstance.mockResolvedValue(mockInstance);

    const req = makeRequest({
      integrationId: "slack",
      enabled: true,
      config: { botToken: "xoxb-123" },
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ status: "connected", integrationId: "slack" });
    expect(mockInstance.connect).toHaveBeenCalled();
  });

  it("returns error status when connection fails with Error", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockIntegrationRegistry.getDefinition.mockReturnValue({ id: "slack" });
    mockPrisma.skillConfig.upsert.mockResolvedValue({});
    const mockInstance = { connect: vi.fn().mockRejectedValue(new Error("Connection refused")) };
    mockIntegrationRegistry.createUserInstance.mockResolvedValue(mockInstance);

    const req = makeRequest({
      integrationId: "slack",
      enabled: true,
      config: { botToken: "xoxb-123" },
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("error");
    expect(json.error).toBe("Connection refused");
  });

  it("returns error status when connection fails with non-Error", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockIntegrationRegistry.getDefinition.mockReturnValue({ id: "slack" });
    mockPrisma.skillConfig.upsert.mockResolvedValue({});
    const mockInstance = { connect: vi.fn().mockRejectedValue("string error") };
    mockIntegrationRegistry.createUserInstance.mockResolvedValue(mockInstance);

    const req = makeRequest({
      integrationId: "slack",
      enabled: true,
      config: { botToken: "xoxb-123" },
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(json.status).toBe("error");
    expect(json.error).toBe("Connection failed");
  });

  it("returns 404 when integration not found", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockIntegrationRegistry.getDefinition.mockReturnValue(null);

    const req = makeRequest({ integrationId: "nonexistent", enabled: true });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Integration not found" });
  });

  it("does not connect when enabled=false", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockIntegrationRegistry.getDefinition.mockReturnValue({ id: "slack" });
    mockPrisma.skillConfig.upsert.mockResolvedValue({});

    const req = makeRequest({
      integrationId: "slack",
      enabled: false,
      config: { botToken: "xoxb-123" },
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(json.status).toBe("ok");
    expect(mockIntegrationRegistry.createUserInstance).not.toHaveBeenCalled();
  });

  it("passes config to upsert correctly", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockIntegrationRegistry.getDefinition.mockReturnValue({ id: "slack" });
    mockPrisma.skillConfig.upsert.mockResolvedValue({});

    const config = { botToken: "xoxb-123" };
    const req = makeRequest({ integrationId: "slack", enabled: true, config });
    await POST(req as any);

    expect(mockPrisma.skillConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          config: JSON.stringify(config),
        }),
        update: expect.objectContaining({
          config: JSON.stringify(config),
        }),
      })
    );
  });

  it("passes undefined config when not provided", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockIntegrationRegistry.getDefinition.mockReturnValue({ id: "slack" });
    mockPrisma.skillConfig.upsert.mockResolvedValue({});

    const req = makeRequest({ integrationId: "slack", enabled: true });
    await POST(req as any);

    expect(mockPrisma.skillConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          config: null,
        }),
        update: expect.objectContaining({
          config: undefined,
        }),
      })
    );
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makeRequest({ integrationId: "slack", enabled: true });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const req = makeRequest({ integrationId: "slack", enabled: true });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});
