import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockPrisma, mockMcpManager, mockLoadGlobalMcpServers, mockGetToolPermissionLabel, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockPrisma: {
    mcpServer: { findMany: vi.fn(), upsert: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  },
  mockMcpManager: {
    hydrateUserConnections: vi.fn(),
    hydrateGlobalConnections: vi.fn(),
    getServersForUser: vi.fn(),
    invalidateUser: vi.fn(),
  },
  mockLoadGlobalMcpServers: vi.fn(),
  mockGetToolPermissionLabel: vi.fn(),
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/mcp/client", () => ({
  mcpManager: mockMcpManager,
}));

vi.mock("@/lib/mcp/global-config", () => ({
  loadGlobalMcpServers: (...args: unknown[]) => mockLoadGlobalMcpServers(...args),
}));

vi.mock("@/lib/mcp/permissions", () => ({
  getToolPermissionLabel: (...args: unknown[]) => mockGetToolPermissionLabel(...args),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { GET, POST, DELETE } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetToolPermissionLabel.mockReturnValue("allowed");
});

// ========================== GET ===========================================

describe("GET /api/mcp", () => {
  it("returns merged user and global servers", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMcpManager.hydrateUserConnections.mockResolvedValue(undefined);
    mockMcpManager.hydrateGlobalConnections.mockResolvedValue(undefined);

    const liveStates = [
      {
        config: { id: "user:user-1:srv-1" },
        status: "connected",
        error: null,
        tools: [{ name: "tool1", description: "desc1" }],
        connectedAt: "2025-01-01",
      },
      {
        config: { id: "global-1" },
        status: "connected",
        error: null,
        tools: [{ name: "gtool1", description: "gdesc1" }],
        connectedAt: "2025-01-01",
      },
    ];
    mockMcpManager.getServersForUser.mockReturnValue(liveStates);

    mockPrisma.mcpServer.findMany.mockResolvedValue([
      {
        id: "srv-1",
        name: "My Server",
        transport: "stdio",
        command: "node",
        args: '["server.js"]',
        url: null,
        enabled: true,
        createdAt: new Date(),
      },
    ]);

    mockLoadGlobalMcpServers.mockResolvedValue([
      {
        id: "global-1",
        name: "Global Server",
        transport: "http",
        command: null,
        url: "http://global.test",
        enabled: true,
      },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.servers).toHaveLength(2);
    expect(json.servers[0].scope).toBe("user");
    expect(json.servers[0].name).toBe("My Server");
    expect(json.servers[0].args).toEqual(["server.js"]);
    expect(json.servers[0].tools).toHaveLength(1);
    expect(json.servers[1].scope).toBe("global");
  });

  it("handles servers with no live state and null args", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMcpManager.hydrateUserConnections.mockResolvedValue(undefined);
    mockMcpManager.hydrateGlobalConnections.mockResolvedValue(undefined);
    mockMcpManager.getServersForUser.mockReturnValue([]);
    mockPrisma.mcpServer.findMany.mockResolvedValue([
      {
        id: "srv-1",
        name: "Offline Server",
        transport: "stdio",
        command: "cmd",
        args: null,
        url: null,
        enabled: true,
      },
    ]);
    mockLoadGlobalMcpServers.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(json.servers[0].status).toBe("disconnected");
    expect(json.servers[0].args).toBeNull();
    expect(json.servers[0].tools).toEqual([]);
  });

  it("shows disabled status for disabled servers with no live state", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMcpManager.hydrateUserConnections.mockResolvedValue(undefined);
    mockMcpManager.hydrateGlobalConnections.mockResolvedValue(undefined);
    mockMcpManager.getServersForUser.mockReturnValue([]);
    mockPrisma.mcpServer.findMany.mockResolvedValue([
      {
        id: "srv-1",
        name: "Disabled",
        transport: "stdio",
        command: "cmd",
        args: null,
        url: null,
        enabled: false,
      },
    ]);
    mockLoadGlobalMcpServers.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(json.servers[0].status).toBe("disabled");
  });

  it("handles global server with no live state (disconnected fallback)", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMcpManager.hydrateUserConnections.mockResolvedValue(undefined);
    mockMcpManager.hydrateGlobalConnections.mockResolvedValue(undefined);
    mockMcpManager.getServersForUser.mockReturnValue([]);
    mockPrisma.mcpServer.findMany.mockResolvedValue([]);
    mockLoadGlobalMcpServers.mockResolvedValue([
      {
        id: "global-no-live",
        name: "Offline Global",
        transport: "http",
        command: null,
        url: "http://offline.test",
        enabled: true,
      },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(json.servers).toHaveLength(1);
    expect(json.servers[0].status).toBe("disconnected");
    expect(json.servers[0].tools).toEqual([]);
    expect(json.servers[0].connectedAt).toBeNull();
    expect(json.servers[0].error).toBeNull();
  });

  it("maps tools with permission labels for global servers with live state", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMcpManager.hydrateUserConnections.mockResolvedValue(undefined);
    mockMcpManager.hydrateGlobalConnections.mockResolvedValue(undefined);

    const liveStates = [
      {
        config: { id: "global-with-tools" },
        status: "connected",
        error: null,
        tools: [
          { name: "tool-a", description: "Tool A desc" },
          { name: "tool-b", description: "Tool B desc" },
        ],
        connectedAt: "2025-06-01T00:00:00Z",
      },
    ];
    mockMcpManager.getServersForUser.mockReturnValue(liveStates);
    mockPrisma.mcpServer.findMany.mockResolvedValue([]);
    mockLoadGlobalMcpServers.mockResolvedValue([
      {
        id: "global-with-tools",
        name: "Global With Tools",
        transport: "http",
        command: null,
        url: "http://tools.test",
        enabled: true,
      },
    ]);
    mockGetToolPermissionLabel.mockReturnValue("requires_approval");

    const res = await GET();
    const json = await res.json();

    expect(json.servers).toHaveLength(1);
    expect(json.servers[0].status).toBe("connected");
    expect(json.servers[0].tools).toHaveLength(2);
    expect(json.servers[0].tools[0]).toEqual({
      name: "tool-a",
      description: "Tool A desc",
      permission: "requires_approval",
    });
    expect(json.servers[0].tools[1]).toEqual({
      name: "tool-b",
      description: "Tool B desc",
      permission: "requires_approval",
    });
    expect(json.servers[0].connectedAt).toBe("2025-06-01T00:00:00Z");
    expect(mockGetToolPermissionLabel).toHaveBeenCalledTimes(2);
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
});

// ========================== POST ==========================================

describe("POST /api/mcp", () => {
  function makeRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("creates a stdio server successfully", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const row = { id: "srv-new", name: "test-server" };
    mockPrisma.mcpServer.upsert.mockResolvedValue(row);
    mockMcpManager.invalidateUser.mockResolvedValue(undefined);
    mockMcpManager.hydrateUserConnections.mockResolvedValue(undefined);
    mockMcpManager.getServersForUser.mockReturnValue([
      {
        config: { id: "user:user-1:srv-new" },
        status: "connected",
        error: null,
        tools: [{ name: "tool1", description: "desc1" }],
      },
    ]);

    const req = makeRequest({
      name: "test-server",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: { KEY: "val" },
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe("srv-new");
    expect(json.status).toBe("connected");
    expect(json.tools).toHaveLength(1);
  });

  it("creates an http server successfully", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const row = { id: "srv-http", name: "http-server" };
    mockPrisma.mcpServer.upsert.mockResolvedValue(row);
    mockMcpManager.invalidateUser.mockResolvedValue(undefined);
    mockMcpManager.hydrateUserConnections.mockResolvedValue(undefined);
    mockMcpManager.getServersForUser.mockReturnValue([]);

    const req = makeRequest({
      name: "http-server",
      transport: "http",
      url: "http://example.com",
      headers: { Authorization: "Bearer token" },
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe("disconnected");
    expect(json.tools).toEqual([]);
  });

  it("returns 400 when name is missing", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({ transport: "stdio", command: "node" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "name and transport are required" });
  });

  it("returns 400 when transport is missing", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({ name: "test" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "name and transport are required" });
  });

  it("returns 400 when stdio transport has no command", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({ name: "test", transport: "stdio" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "command is required for stdio transport" });
  });

  it("returns 400 when http transport has no url", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({ name: "test", transport: "http" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "url is required for http transport" });
  });

  it("handles enabled=false", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.mcpServer.upsert.mockResolvedValue({ id: "srv-1", name: "test" });
    mockMcpManager.invalidateUser.mockResolvedValue(undefined);
    mockMcpManager.hydrateUserConnections.mockResolvedValue(undefined);
    mockMcpManager.getServersForUser.mockReturnValue([]);

    const req = makeRequest({
      name: "test",
      transport: "stdio",
      command: "node",
      enabled: false,
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(mockPrisma.mcpServer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ enabled: false }),
        update: expect.objectContaining({ enabled: false }),
      })
    );
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makeRequest({ name: "test", transport: "stdio", command: "node" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const req = makeRequest({ name: "test", transport: "stdio", command: "node" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});

// ========================== DELETE ========================================

describe("DELETE /api/mcp", () => {
  function makeRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/mcp", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("deletes a server successfully", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.mcpServer.findFirst.mockResolvedValue({ id: "srv-1", name: "My Server" });
    mockMcpManager.invalidateUser.mockResolvedValue(undefined);
    mockPrisma.mcpServer.delete.mockResolvedValue({});

    const req = makeRequest({ id: "srv-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ deleted: true });
    expect(mockMcpManager.invalidateUser).toHaveBeenCalledWith("user-1");
    expect(mockPrisma.mcpServer.delete).toHaveBeenCalledWith({ where: { id: "srv-1" } });
  });

  it("returns 400 when id is missing", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({});
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "id is required" });
  });

  it("returns 404 when server not found", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.mcpServer.findFirst.mockResolvedValue(null);

    const req = makeRequest({ id: "srv-missing" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Server not found" });
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makeRequest({ id: "srv-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const req = makeRequest({ id: "srv-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});
