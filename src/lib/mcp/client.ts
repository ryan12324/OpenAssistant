import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { prisma } from "@/lib/prisma";
import { loadGlobalMcpServers } from "./global-config";
import { getLogger } from "@/lib/logger";
import type {
  McpServerConfig,
  McpServerState,
  McpServerStatus,
  McpDiscoveredTool,
} from "./types";

const log = getLogger("mcp");

/**
 * Manages MCP server connections, tool discovery, and tool call routing.
 * Singleton — use `mcpManager` export.
 */
class McpClientManager {
  /** serverId → live state */
  private servers = new Map<string, McpServerState>();
  /** serverId → MCP Client instance */
  private clients = new Map<string, Client>();
  /** serverId → transport (for cleanup) */
  private transports = new Map<string, Transport>();
  /** Track which users have been hydrated this process tick */
  private hydratedUsers = new Set<string>();
  private globalHydrated = false;

  // ── Connection lifecycle ──────────────────────────────────────

  async connectServer(config: McpServerConfig): Promise<McpServerState> {
    log.info("Connecting to MCP server", {
      serverId: config.id,
      name: config.name,
      transport: config.transport,
    });

    // If already connected, return existing state
    const existing = this.servers.get(config.id);
    if (existing?.status === "connected") {
      log.debug("Server already connected, returning existing state", {
        serverId: config.id,
        name: config.name,
      });
      return existing;
    }

    const state: McpServerState = {
      config,
      status: "connecting",
      tools: [],
    };
    this.servers.set(config.id, state);

    try {
      const client = new Client(
        { name: "openassistant", version: "0.1.0" },
        { capabilities: {} }
      );

      let transport: Transport;

      if (config.transport === "stdio") {
        if (!config.command) throw new Error("stdio transport requires a command");
        const { StdioClientTransport } = await import(/* webpackIgnore: true */ "@modelcontextprotocol/sdk/client/stdio.js");
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args ?? [],
          env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
        });
      } else {
        if (!config.url) throw new Error("http transport requires a url");
        transport = new StreamableHTTPClientTransport(
          new URL(config.url),
          { requestInit: { headers: config.headers ?? {} } }
        );
      }

      await client.connect(transport);

      // Discover tools
      const toolsResult = await client.listTools();
      const discoveredTools: McpDiscoveredTool[] = (toolsResult.tools ?? []).map(
        (t) => ({
          serverId: config.id,
          serverName: config.name,
          name: t.name,
          description: t.description,
          inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
          annotations: t.annotations as McpDiscoveredTool["annotations"],
        })
      );

      this.clients.set(config.id, client);
      this.transports.set(config.id, transport);

      state.status = "connected";
      state.tools = discoveredTools;
      state.connectedAt = new Date();
      state.error = undefined;

      log.info("Successfully connected to MCP server", {
        serverId: config.id,
        name: config.name,
        transport: config.transport,
        toolCount: discoveredTools.length,
      });

      return state;
    } catch (err) {
      state.status = "error";
      state.error = err instanceof Error ? err.message : String(err);
      log.error("Failed to connect to MCP server", {
        serverId: config.id,
        name: config.name,
        transport: config.transport,
        error: state.error,
      });
      return state;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    log.info("Disconnecting MCP server", { serverId });

    const client = this.clients.get(serverId);
    const transport = this.transports.get(serverId);

    try {
      if (client) {
        log.debug("Closing MCP client", { serverId });
        await client.close();
      }
    } catch {
      // Best-effort cleanup
    }
    try {
      if (transport) {
        log.debug("Closing MCP transport", { serverId });
        await transport.close();
      }
    } catch {
      // Best-effort cleanup
    }

    this.clients.delete(serverId);
    this.transports.delete(serverId);
    this.servers.delete(serverId);

    log.debug("MCP server cleanup complete", { serverId });
  }

  // ── Tool access ───────────────────────────────────────────────

  /**
   * Call a tool on a connected MCP server.
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ content: string; isError?: boolean }> {
    log.info("Calling MCP tool", { serverId, toolName });
    log.debug("MCP tool call arguments", { serverId, toolName, args });

    const client = this.clients.get(serverId);
    if (!client) {
      log.error("MCP server not connected for tool call", { serverId, toolName });
      return { content: `MCP server "${serverId}" is not connected`, isError: true };
    }

    try {
      const result = await client.callTool({ name: toolName, arguments: args });
      // MCP tools return content as an array of content blocks
      const textParts = (result.content as Array<{ type: string; text?: string }>)
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!);
      const response = {
        content: textParts.join("\n") || JSON.stringify(result.content),
        isError: result.isError === true,
      };
      log.info("MCP tool call succeeded", {
        serverId,
        toolName,
        isError: response.isError,
        contentLength: response.content.length,
      });
      return response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error("MCP tool call failed", {
        serverId,
        toolName,
        error: errorMessage,
      });
      return {
        content: `MCP tool call failed: ${errorMessage}`,
        isError: true,
      };
    }
  }

  /**
   * Get all discovered tools across all connected servers for a user.
   * Includes both user-scoped and global servers.
   */
  getToolsForUser(userId: string): McpDiscoveredTool[] {
    const tools: McpDiscoveredTool[] = [];
    for (const state of this.servers.values()) {
      if (state.status !== "connected") continue;
      // Include global servers and servers belonging to this user
      const isGlobal = state.config.scope === "global";
      const isUserScoped = state.config.id.startsWith(`user:${userId}:`);
      if (isGlobal || isUserScoped) {
        tools.push(...state.tools);
      }
    }
    log.debug("Retrieved tools for user", { userId, toolCount: tools.length });
    return tools;
  }

  /**
   * Get all server states visible to a user (for the API/UI).
   */
  getServersForUser(userId: string): McpServerState[] {
    const states: McpServerState[] = [];
    for (const state of this.servers.values()) {
      const isGlobal = state.config.scope === "global";
      const isUserScoped = state.config.id.startsWith(`user:${userId}:`);
      if (isGlobal || isUserScoped) {
        states.push(state);
      }
    }
    log.debug("Retrieved servers for user", { userId, serverCount: states.length });
    return states;
  }

  // ── Hydration (load configs & connect) ────────────────────────

  /**
   * Load and connect per-user MCP servers from the database.
   * Only hydrates once per process lifecycle per user (call invalidateUser to re-hydrate).
   */
  async hydrateUserConnections(userId: string): Promise<void> {
    if (this.hydratedUsers.has(userId)) {
      log.debug("User connections already hydrated, skipping", { userId });
      return;
    }
    this.hydratedUsers.add(userId);

    try {
      const rows = await prisma.mcpServer.findMany({
        where: { userId, enabled: true },
      });

      const configs: McpServerConfig[] = rows.map((row) => ({
        id: `user:${userId}:${row.id}`,
        name: row.name,
        transport: row.transport as "stdio" | "http",
        command: row.command ?? undefined,
        args: row.args ? JSON.parse(row.args) : undefined,
        env: row.env ? JSON.parse(row.env) : undefined,
        url: row.url ?? undefined,
        headers: row.headers ? JSON.parse(row.headers) : undefined,
        enabled: row.enabled,
        scope: "user" as const,
      }));

      log.info("Hydrating user MCP connections", {
        userId,
        configCount: configs.length,
      });

      await Promise.allSettled(configs.map((c) => this.connectServer(c)));
    } catch (err) {
      log.error("Failed to hydrate user MCP connections", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Load and connect global MCP servers from the config file.
   */
  async hydrateGlobalConnections(): Promise<void> {
    if (this.globalHydrated) {
      log.debug("Global connections already hydrated, skipping");
      return;
    }
    this.globalHydrated = true;

    try {
      const configs = await loadGlobalMcpServers();
      const enabledConfigs = configs.filter((c) => c.enabled);

      log.info("Hydrating global MCP connections", {
        configCount: enabledConfigs.length,
      });

      await Promise.allSettled(
        enabledConfigs.map((c) => this.connectServer(c))
      );
    } catch (err) {
      log.error("Failed to hydrate global MCP connections", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Force re-hydration for a user (e.g. after config change).
   */
  async invalidateUser(userId: string): Promise<void> {
    log.info("Invalidating user MCP connections", { userId });

    // Disconnect existing user servers
    for (const [id] of this.servers) {
      if (id.startsWith(`user:${userId}:`)) {
        await this.disconnectServer(id);
      }
    }
    this.hydratedUsers.delete(userId);
  }

  /**
   * Gracefully disconnect all servers (for process shutdown).
   */
  async shutdown(): Promise<void> {
    const ids = [...this.servers.keys()];
    log.info("Shutting down MCP client manager", { serverCount: ids.length });
    await Promise.allSettled(ids.map((id) => this.disconnectServer(id)));
  }
}

/** Singleton MCP client manager */
export const mcpManager = new McpClientManager();
