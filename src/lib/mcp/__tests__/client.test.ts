import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – use vi.hoisted()
// ---------------------------------------------------------------------------
const {
  mockLogger,
  mockPrismaMcpServer,
  mockLoadGlobalMcpServers,
  mockClientConnect,
  mockClientClose,
  mockClientListTools,
  mockClientCallTool,
  mockStdioTransportClose,
  mockHttpTransportClose,
} = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  },
  mockPrismaMcpServer: {
    findMany: vi.fn(),
  },
  mockLoadGlobalMcpServers: vi.fn(),
  mockClientConnect: vi.fn(),
  mockClientClose: vi.fn(),
  mockClientListTools: vi.fn(),
  mockClientCallTool: vi.fn(),
  mockStdioTransportClose: vi.fn(),
  mockHttpTransportClose: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => mockLogger),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mcpServer: mockPrismaMcpServer,
  },
}));

vi.mock("../global-config", () => ({
  loadGlobalMcpServers: mockLoadGlobalMcpServers,
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    connect = mockClientConnect;
    close = mockClientClose;
    listTools = mockClientListTools;
    callTool = mockClientCallTool;
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class {
    close = mockStdioTransportClose;
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {
    close = mockHttpTransportClose;
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { mcpManager } from "../client";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("McpClientManager", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Clean up all servers between tests
    await mcpManager.shutdown();
  });

  // ── connectServer ──────────────────────────────────────────────────

  describe("connectServer()", () => {
    it("connects stdio server successfully", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({
        tools: [
          {
            name: "tool1",
            description: "A tool",
            inputSchema: { type: "object" },
            annotations: { readOnlyHint: true },
          },
        ],
      });

      const config = {
        id: "test-stdio-1",
        name: "Test Stdio",
        transport: "stdio" as const,
        command: "node",
        args: ["server.js"],
        env: { API_KEY: "test" },
        enabled: true,
        scope: "global" as const,
      };

      const state = await mcpManager.connectServer(config);

      expect(state.status).toBe("connected");
      expect(state.tools).toHaveLength(1);
      expect(state.tools[0].name).toBe("tool1");
      expect(state.tools[0].serverId).toBe("test-stdio-1");
      expect(state.tools[0].serverName).toBe("Test Stdio");
      expect(state.connectedAt).toBeInstanceOf(Date);
    });

    it("connects http server successfully with headers", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      const config = {
        id: "test-http-1",
        name: "Test HTTP",
        transport: "http" as const,
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer token" },
        enabled: true,
        scope: "global" as const,
      };

      const state = await mcpManager.connectServer(config);

      expect(state.status).toBe("connected");
      expect(state.tools).toHaveLength(0);
    });

    it("connects http server successfully without headers", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      const config = {
        id: "test-http-no-headers",
        name: "Test HTTP No Headers",
        transport: "http" as const,
        url: "https://example.com/mcp",
        enabled: true,
        scope: "global" as const,
      };

      const state = await mcpManager.connectServer(config);

      expect(state.status).toBe("connected");
    });

    it("returns existing state if already connected", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      const config = {
        id: "test-existing",
        name: "Existing",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      };

      const state1 = await mcpManager.connectServer(config);
      expect(state1.status).toBe("connected");

      const state2 = await mcpManager.connectServer(config);
      expect(state2).toBe(state1);

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
    });

    it("returns error for stdio without command", async () => {
      const config = {
        id: "test-no-cmd",
        name: "No Command",
        transport: "stdio" as const,
        enabled: true,
        scope: "global" as const,
      };

      const state = await mcpManager.connectServer(config);

      expect(state.status).toBe("error");
      expect(state.error).toContain("stdio transport requires a command");
    });

    it("returns error for http without url", async () => {
      const config = {
        id: "test-no-url",
        name: "No URL",
        transport: "http" as const,
        enabled: true,
        scope: "global" as const,
      };

      const state = await mcpManager.connectServer(config);

      expect(state.status).toBe("error");
      expect(state.error).toContain("http transport requires a url");
    });

    it("handles connection error gracefully", async () => {
      mockClientConnect.mockRejectedValue(new Error("Connection refused"));

      const config = {
        id: "test-conn-err",
        name: "Conn Error",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      };

      const state = await mcpManager.connectServer(config);

      expect(state.status).toBe("error");
      expect(state.error).toBe("Connection refused");
    });

    it("handles non-Error connection failure", async () => {
      mockClientConnect.mockRejectedValue("string error");

      const config = {
        id: "test-conn-str-err",
        name: "String Error",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      };

      const state = await mcpManager.connectServer(config);

      expect(state.status).toBe("error");
      expect(state.error).toBe("string error");
    });

    it("handles tools with no inputSchema or annotations", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({
        tools: [{ name: "bare-tool" }],
      });

      const config = {
        id: "test-bare-tools",
        name: "Bare Tools",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      };

      const state = await mcpManager.connectServer(config);

      expect(state.status).toBe("connected");
      expect(state.tools[0].inputSchema).toEqual({});
      expect(state.tools[0].description).toBeUndefined();
    });

    it("handles listTools returning undefined tools array", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({});

      const config = {
        id: "test-no-tools",
        name: "No Tools",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      };

      const state = await mcpManager.connectServer(config);

      expect(state.status).toBe("connected");
      expect(state.tools).toHaveLength(0);
    });

    it("uses default empty arrays for stdio args/env when not provided", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      const config = {
        id: "test-defaults",
        name: "Defaults",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      };

      const state = await mcpManager.connectServer(config);
      expect(state.status).toBe("connected");
    });
  });

  // ── disconnectServer ───────────────────────────────────────────────

  describe("disconnectServer()", () => {
    it("disconnects a connected server", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.connectServer({
        id: "test-disconnect",
        name: "Disconnect Test",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      await mcpManager.disconnectServer("test-disconnect");

      expect(mockClientClose).toHaveBeenCalled();
    });

    it("handles disconnecting a non-existent server gracefully", async () => {
      await expect(
        mcpManager.disconnectServer("nonexistent-server")
      ).resolves.not.toThrow();
    });

    it("handles close errors gracefully", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });
      mockClientClose.mockRejectedValue(new Error("close error"));
      mockStdioTransportClose.mockRejectedValue(new Error("transport close error"));

      await mcpManager.connectServer({
        id: "test-close-err",
        name: "Close Error",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      await expect(
        mcpManager.disconnectServer("test-close-err")
      ).resolves.not.toThrow();
    });
  });

  // ── callTool ───────────────────────────────────────────────────────

  describe("callTool()", () => {
    it("calls tool and returns text content", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.connectServer({
        id: "call-tool-srv",
        name: "Call Tool Server",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      mockClientCallTool.mockResolvedValue({
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: " World" },
        ],
        isError: false,
      });

      const result = await mcpManager.callTool("call-tool-srv", "myTool", {
        arg1: "val",
      });

      expect(result.content).toBe("Hello\n World");
      expect(result.isError).toBe(false);
    });

    it("falls back to JSON.stringify when no text content", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.connectServer({
        id: "call-json-srv",
        name: "JSON Tool Server",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      mockClientCallTool.mockResolvedValue({
        content: [{ type: "image", data: "base64..." }],
        isError: false,
      });

      const result = await mcpManager.callTool("call-json-srv", "imgTool", {});

      expect(result.content).toBe(
        JSON.stringify([{ type: "image", data: "base64..." }])
      );
    });

    it("returns error for tool with isError true", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.connectServer({
        id: "call-iserr-srv",
        name: "IsError Server",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      mockClientCallTool.mockResolvedValue({
        content: [{ type: "text", text: "something went wrong" }],
        isError: true,
      });

      const result = await mcpManager.callTool(
        "call-iserr-srv",
        "failTool",
        {}
      );

      expect(result.content).toBe("something went wrong");
      expect(result.isError).toBe(true);
    });

    it("returns error when server not connected", async () => {
      const result = await mcpManager.callTool(
        "nonexistent-server",
        "tool",
        {}
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain("not connected");
    });

    it("handles tool call error (Error instance)", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.connectServer({
        id: "call-err-srv",
        name: "Error Server",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      mockClientCallTool.mockRejectedValue(new Error("Tool crashed"));

      const result = await mcpManager.callTool("call-err-srv", "tool", {});

      expect(result.isError).toBe(true);
      expect(result.content).toContain("MCP tool call failed: Tool crashed");
    });

    it("handles tool call error (non-Error)", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.connectServer({
        id: "call-nonstr-srv",
        name: "NonStr Server",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      mockClientCallTool.mockRejectedValue(42);

      const result = await mcpManager.callTool("call-nonstr-srv", "tool", {});

      expect(result.isError).toBe(true);
      expect(result.content).toContain("42");
    });

    it("filters out non-text content blocks", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.connectServer({
        id: "filter-srv",
        name: "Filter Server",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      mockClientCallTool.mockResolvedValue({
        content: [
          { type: "image", data: "base64" },
          { type: "text", text: "visible" },
          { type: "text" }, // text without text property
        ],
        isError: false,
      });

      const result = await mcpManager.callTool("filter-srv", "tool", {});

      expect(result.content).toBe("visible");
    });
  });

  // ── getToolsForUser ────────────────────────────────────────────────

  describe("getToolsForUser()", () => {
    it("returns tools from global servers", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({
        tools: [{ name: "global-tool" }],
      });

      await mcpManager.connectServer({
        id: "global:test-server",
        name: "Global Server",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      const tools = mcpManager.getToolsForUser("user-1");
      const globalTool = tools.find((t) => t.name === "global-tool");
      expect(globalTool).toBeDefined();
    });

    it("returns tools from user-scoped servers", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({
        tools: [{ name: "user-tool" }],
      });

      await mcpManager.connectServer({
        id: "user:user-1:server-1",
        name: "User Server",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "user" as const,
      });

      const tools = mcpManager.getToolsForUser("user-1");
      const userTool = tools.find((t) => t.name === "user-tool");
      expect(userTool).toBeDefined();

      const otherTools = mcpManager.getToolsForUser("user-2");
      const otherUserTool = otherTools.find((t) => t.name === "user-tool");
      expect(otherUserTool).toBeUndefined();
    });

    it("excludes tools from disconnected/error servers", async () => {
      await mcpManager.connectServer({
        id: "test-err-tools",
        name: "Error Server",
        transport: "stdio" as const,
        enabled: true,
        scope: "global" as const,
      });

      const tools = mcpManager.getToolsForUser("user-1");
      const errTool = tools.find((t) => t.serverId === "test-err-tools");
      expect(errTool).toBeUndefined();
    });
  });

  // ── getServersForUser ──────────────────────────────────────────────

  describe("getServersForUser()", () => {
    it("returns global and user-scoped server states", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.connectServer({
        id: "global:srv-for-user",
        name: "Global",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });
      await mcpManager.connectServer({
        id: "user:user-x:srv",
        name: "User Srv",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "user" as const,
      });

      const servers = mcpManager.getServersForUser("user-x");
      const ids = servers.map((s) => s.config.id);
      expect(ids).toContain("global:srv-for-user");
      expect(ids).toContain("user:user-x:srv");
    });

    it("excludes other users' servers", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.connectServer({
        id: "user:other-user:srv",
        name: "Other User Srv",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "user" as const,
      });

      const servers = mcpManager.getServersForUser("my-user");
      const found = servers.find((s) => s.config.id === "user:other-user:srv");
      expect(found).toBeUndefined();
    });
  });

  // ── hydrateUserConnections ─────────────────────────────────────────

  describe("hydrateUserConnections()", () => {
    it("loads and connects user MCP servers from database", async () => {
      mockPrismaMcpServer.findMany.mockResolvedValue([
        {
          id: "srv1",
          name: "DB Server",
          transport: "stdio",
          command: "node",
          args: JSON.stringify(["server.js"]),
          env: JSON.stringify({ KEY: "val" }),
          url: null,
          headers: null,
          enabled: true,
        },
      ]);
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.hydrateUserConnections("hydrate-user-1");

      expect(mockPrismaMcpServer.findMany).toHaveBeenCalledWith({
        where: { userId: "hydrate-user-1", enabled: true },
      });
    });

    it("skips hydration if already hydrated", async () => {
      mockPrismaMcpServer.findMany.mockResolvedValue([]);

      await mcpManager.hydrateUserConnections("hydrate-user-2");
      await mcpManager.hydrateUserConnections("hydrate-user-2");

      expect(mockPrismaMcpServer.findMany).toHaveBeenCalledTimes(1);
    });

    it("handles database errors gracefully", async () => {
      mockPrismaMcpServer.findMany.mockRejectedValue(
        new Error("DB connection error")
      );

      await expect(
        mcpManager.hydrateUserConnections("hydrate-user-err")
      ).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("handles non-Error database failure", async () => {
      mockPrismaMcpServer.findMany.mockRejectedValue("string db error");

      await expect(
        mcpManager.hydrateUserConnections("hydrate-user-nonstr")
      ).resolves.not.toThrow();
    });

    it("parses http transport with headers from database", async () => {
      mockPrismaMcpServer.findMany.mockResolvedValue([
        {
          id: "srv-http",
          name: "HTTP DB Server",
          transport: "http",
          command: null,
          args: null,
          env: null,
          url: "https://example.com/mcp",
          headers: JSON.stringify({ Authorization: "Bearer token" }),
          enabled: true,
        },
      ]);
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.hydrateUserConnections("hydrate-user-http");

      expect(mockPrismaMcpServer.findMany).toHaveBeenCalled();
    });
  });

  // ── hydrateGlobalConnections ───────────────────────────────────────

  describe("hydrateGlobalConnections()", () => {
    it("loads and connects global MCP servers from config, then skips on re-call", async () => {
      mockLoadGlobalMcpServers.mockResolvedValue([
        {
          id: "global:test",
          name: "Global Test",
          transport: "stdio",
          command: "node",
          enabled: true,
          scope: "global",
        },
        {
          id: "global:disabled",
          name: "Disabled",
          transport: "stdio",
          command: "node",
          enabled: false,
          scope: "global",
        },
      ]);
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.hydrateGlobalConnections();

      expect(mockLoadGlobalMcpServers).toHaveBeenCalledTimes(1);

      // Second call should hit the early-return branch (lines 288-290)
      await mcpManager.hydrateGlobalConnections();

      // loadGlobalMcpServers should still have been called only once
      expect(mockLoadGlobalMcpServers).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Global connections already hydrated, skipping"
      );
    });
  });

  describe("hydrateGlobalConnections() error handling", () => {
    it("handles loadGlobalMcpServers Error instance gracefully", async () => {
      // Reset the private globalHydrated flag so we can test the error path
      (mcpManager as any).globalHydrated = false;

      mockLoadGlobalMcpServers.mockRejectedValue(
        new Error("Config file not found")
      );

      await expect(
        mcpManager.hydrateGlobalConnections()
      ).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to hydrate global MCP connections",
        { error: "Config file not found" }
      );
    });

    it("handles loadGlobalMcpServers non-Error rejection gracefully", async () => {
      // Reset the private globalHydrated flag again
      (mcpManager as any).globalHydrated = false;

      mockLoadGlobalMcpServers.mockRejectedValue("string error");

      await expect(
        mcpManager.hydrateGlobalConnections()
      ).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to hydrate global MCP connections",
        { error: "string error" }
      );
    });
  });

  // ── invalidateUser ─────────────────────────────────────────────────

  describe("invalidateUser()", () => {
    it("disconnects user servers and allows re-hydration", async () => {
      mockPrismaMcpServer.findMany.mockResolvedValue([]);
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.hydrateUserConnections("invalidate-user-1");
      await mcpManager.invalidateUser("invalidate-user-1");
      await mcpManager.hydrateUserConnections("invalidate-user-1");

      // findMany called twice (once for each hydration)
      const calls = mockPrismaMcpServer.findMany.mock.calls.filter(
        (c: any[]) => c[0].where.userId === "invalidate-user-1"
      );
      expect(calls.length).toBe(2);
    });

    it("disconnects only servers belonging to the user, not others", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({
        tools: [{ name: "some-tool" }],
      });

      // Connect a user server and a global server
      await mcpManager.connectServer({
        id: "user:inv-user:srv",
        name: "User Srv",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "user" as const,
      });
      await mcpManager.connectServer({
        id: "global:keep-server",
        name: "Global Srv",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      await mcpManager.invalidateUser("inv-user");

      // User server should be removed
      const tools = mcpManager.getToolsForUser("inv-user");
      const found = tools.find((t) => t.serverId === "user:inv-user:srv");
      expect(found).toBeUndefined();

      // Global server should still be present
      const globalTools = mcpManager.getToolsForUser("inv-user");
      const globalFound = globalTools.find((t) => t.serverId === "global:keep-server");
      expect(globalFound).toBeDefined();
    });
  });

  // ── shutdown ───────────────────────────────────────────────────────

  describe("shutdown()", () => {
    it("disconnects all connected servers", async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({ tools: [] });

      await mcpManager.connectServer({
        id: "shutdown-1",
        name: "Srv 1",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });
      await mcpManager.connectServer({
        id: "shutdown-2",
        name: "Srv 2",
        transport: "stdio" as const,
        command: "node",
        enabled: true,
        scope: "global" as const,
      });

      await mcpManager.shutdown();

      const servers = mcpManager.getServersForUser("any-user");
      const found = servers.filter(
        (s) =>
          s.config.id === "shutdown-1" || s.config.id === "shutdown-2"
      );
      expect(found).toHaveLength(0);
    });
  });
});
