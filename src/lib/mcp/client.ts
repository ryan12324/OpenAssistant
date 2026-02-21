import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { prisma } from "@/lib/prisma";
import { loadGlobalMcpServers } from "./global-config";
import type {
  McpServerConfig,
  McpServerState,
  McpServerStatus,
  McpDiscoveredTool,
} from "./types";

/**
 * Manages MCP server connections, tool discovery, and tool call routing.
 * Singleton — use `mcpManager` export.
 */
class McpClientManager {
  /** serverId → live state */
  private servers = new Map<string, McpServerState>();
  /** serverId → MCP Client instance */
  private clients = new Map<string, Client>();
  /** serverId → StdioClientTransport (for cleanup) */
  private transports = new Map<string, StdioClientTransport | StreamableHTTPClientTransport>();
  /** Track which users have been hydrated this process tick */
  private hydratedUsers = new Set<string>();
  private globalHydrated = false;

  // ── Connection lifecycle ──────────────────────────────────────

  async connectServer(config: McpServerConfig): Promise<McpServerState> {
    // If already connected, return existing state
    const existing = this.servers.get(config.id);
    if (existing?.status === "connected") return existing;

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

      let transport: StdioClientTransport | StreamableHTTPClientTransport;

      if (config.transport === "stdio") {
        if (!config.command) throw new Error("stdio transport requires a command");
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

      console.log(
        `[MCP] Connected to "${config.name}" (${config.transport}) — ${discoveredTools.length} tools`
      );

      return state;
    } catch (err) {
      state.status = "error";
      state.error = err instanceof Error ? err.message : String(err);
      console.error(`[MCP] Failed to connect to "${config.name}":`, state.error);
      return state;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const transport = this.transports.get(serverId);

    try {
      if (client) await client.close();
    } catch {
      // Best-effort cleanup
    }
    try {
      if (transport) await transport.close();
    } catch {
      // Best-effort cleanup
    }

    this.clients.delete(serverId);
    this.transports.delete(serverId);
    this.servers.delete(serverId);
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
    const client = this.clients.get(serverId);
    if (!client) {
      return { content: `MCP server "${serverId}" is not connected`, isError: true };
    }

    try {
      const result = await client.callTool({ name: toolName, arguments: args });
      // MCP tools return content as an array of content blocks
      const textParts = (result.content as Array<{ type: string; text?: string }>)
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!);
      return {
        content: textParts.join("\n") || JSON.stringify(result.content),
        isError: result.isError === true,
      };
    } catch (err) {
      return {
        content: `MCP tool call failed: ${err instanceof Error ? err.message : String(err)}`,
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
    return states;
  }

  // ── Hydration (load configs & connect) ────────────────────────

  /**
   * Load and connect per-user MCP servers from the database.
   * Only hydrates once per process lifecycle per user (call invalidateUser to re-hydrate).
   */
  async hydrateUserConnections(userId: string): Promise<void> {
    if (this.hydratedUsers.has(userId)) return;
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

      await Promise.allSettled(configs.map((c) => this.connectServer(c)));
    } catch (err) {
      console.error(`[MCP] Failed to hydrate user ${userId}:`, err);
    }
  }

  /**
   * Load and connect global MCP servers from the config file.
   */
  async hydrateGlobalConnections(): Promise<void> {
    if (this.globalHydrated) return;
    this.globalHydrated = true;

    try {
      const configs = await loadGlobalMcpServers();
      await Promise.allSettled(
        configs.filter((c) => c.enabled).map((c) => this.connectServer(c))
      );
    } catch (err) {
      console.error("[MCP] Failed to hydrate global servers:", err);
    }
  }

  /**
   * Force re-hydration for a user (e.g. after config change).
   */
  async invalidateUser(userId: string): Promise<void> {
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
    await Promise.allSettled(ids.map((id) => this.disconnectServer(id)));
  }
}

/** Singleton MCP client manager */
export const mcpManager = new McpClientManager();
