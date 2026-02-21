import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { mcpManager } from "@/lib/mcp/client";
import { loadGlobalMcpServers } from "@/lib/mcp/global-config";
import { getToolPermissionLabel } from "@/lib/mcp/permissions";
import type { McpDiscoveredTool } from "@/lib/mcp/types";
import { getLogger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";

const log = getLogger("api.mcp");

interface McpLiveState {
  config: { id: string };
  status: string;
  error?: string;
  tools: McpDiscoveredTool[];
  connectedAt?: Date;
}

/** Map a server config + optional live state to a response object. */
function mapServerToResponse(
  server: {
    id: string;
    name: string;
    transport: string;
    command?: string | null;
    args?: string | null;
    url?: string | null;
    enabled: boolean;
    scope: "user" | "global";
  },
  liveState: McpLiveState | undefined
) {
  return {
    id: server.id,
    name: server.name,
    transport: server.transport,
    command: server.command ?? undefined,
    args: server.args ? JSON.parse(server.args) : (server.args === null ? null : undefined),
    url: server.url ?? undefined,
    enabled: server.enabled,
    scope: server.scope,
    status: liveState?.status ?? (server.scope === "user" && !server.enabled ? "disabled" : "disconnected"),
    error: liveState?.error ?? null,
    tools: (liveState?.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      permission: getToolPermissionLabel(t),
    })),
    connectedAt: liveState?.connectedAt ?? null,
  };
}

/**
 * GET /api/mcp — List all MCP servers for the current user.
 * Returns per-user servers (from DB) and global servers (from config file),
 * along with their connection status and discovered tools.
 */
export async function GET() {
  try {
    log.info("Listing MCP servers");
    const session = await requireSession();
    const userId = session.user.id;

    // Ensure connections are hydrated
    await mcpManager.hydrateUserConnections(userId);
    await mcpManager.hydrateGlobalConnections();

    const states = mcpManager.getServersForUser(userId);

    // Also load raw DB configs for servers that may not be connected
    const dbServers = await prisma.mcpServer.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Merge DB rows with live state
    const userServers = dbServers.map((row) => {
      const liveId = `user:${userId}:${row.id}`;
      const live = states.find((s) => s.config.id === liveId);
      return mapServerToResponse(
        {
          id: row.id,
          name: row.name,
          transport: row.transport,
          command: row.command,
          args: row.args,
          url: row.url,
          enabled: row.enabled,
          scope: "user",
        },
        live as McpLiveState | undefined
      );
    });

    // Global servers (read-only)
    const globalConfigs = await loadGlobalMcpServers();
    const globalServers = globalConfigs.map((config) => {
      const live = states.find((s) => s.config.id === config.id);
      return mapServerToResponse(
        {
          id: config.id,
          name: config.name,
          transport: config.transport,
          command: config.command,
          url: config.url,
          enabled: config.enabled,
          scope: "global",
        },
        live as McpLiveState | undefined
      );
    });

    log.info("MCP servers listed", {
      userServerCount: userServers.length,
      globalServerCount: globalServers.length,
      totalServerCount: userServers.length + globalServers.length,
    });

    return Response.json({ servers: [...userServers, ...globalServers] });
  } catch (error) {
    return handleApiError(error, "list MCP servers");
  }
}

/**
 * POST /api/mcp — Add or update a per-user MCP server.
 * Body: { name, transport, command?, args?, env?, url?, headers?, enabled? }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user.id;
    const body = await req.json();

    const { name, transport, command, args, env, url, headers, enabled } = body;

    log.info("Creating/updating MCP server", { name, transport });

    if (!name || !transport) {
      log.warn("MCP create validation failed: missing name or transport", { name, transport });
      return Response.json(
        { error: "name and transport are required" },
        { status: 400 }
      );
    }

    if (transport === "stdio" && !command) {
      log.warn("MCP create validation failed: missing command for stdio transport", { name });
      return Response.json(
        { error: "command is required for stdio transport" },
        { status: 400 }
      );
    }

    if (transport === "http" && !url) {
      log.warn("MCP create validation failed: missing url for http transport", { name });
      return Response.json(
        { error: "url is required for http transport" },
        { status: 400 }
      );
    }

    // Upsert the server config
    log.debug("Upserting MCP server config", { userId, name, transport });
    const row = await prisma.mcpServer.upsert({
      where: { userId_name: { userId, name } },
      create: {
        userId,
        name,
        transport,
        command: command ?? null,
        args: args ? JSON.stringify(args) : null,
        env: env ? JSON.stringify(env) : null,
        url: url ?? null,
        headers: headers ? JSON.stringify(headers) : null,
        enabled: enabled !== false,
      },
      update: {
        transport,
        command: command ?? null,
        args: args ? JSON.stringify(args) : null,
        env: env ? JSON.stringify(env) : null,
        url: url ?? null,
        headers: headers ? JSON.stringify(headers) : null,
        enabled: enabled !== false,
      },
    });

    // Invalidate and re-connect
    await mcpManager.invalidateUser(userId);
    await mcpManager.hydrateUserConnections(userId);

    // Get the new state
    const liveId = `user:${userId}:${row.id}`;
    const states = mcpManager.getServersForUser(userId);
    const live = states.find((s) => s.config.id === liveId);

    const toolCount = (live?.tools ?? []).length;
    log.info("MCP server created/updated successfully", {
      serverId: row.id,
      name: row.name,
      status: live?.status ?? "disconnected",
      toolCount,
    });

    return Response.json({
      id: row.id,
      name: row.name,
      status: live?.status ?? "disconnected",
      error: live?.error ?? null,
      tools: (live?.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
      })),
    });
  } catch (error) {
    return handleApiError(error, "create MCP server");
  }
}

/**
 * DELETE /api/mcp — Remove a per-user MCP server.
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user.id;
    const body = await req.json();

    log.info("Deleting MCP server", { serverId: body.id });

    if (!body.id) {
      log.warn("MCP delete validation failed: missing id");
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    // Verify ownership
    const row = await prisma.mcpServer.findFirst({
      where: { id: body.id, userId },
    });

    if (!row) {
      log.warn("MCP server not found for deletion", { serverId: body.id, userId });
      return Response.json({ error: "Server not found" }, { status: 404 });
    }

    // Disconnect and delete
    await mcpManager.invalidateUser(userId);
    await prisma.mcpServer.delete({ where: { id: body.id } });

    log.info("MCP server deleted successfully", { serverId: body.id, name: row.name });

    return Response.json({ deleted: true });
  } catch (error) {
    return handleApiError(error, "delete MCP server");
  }
}
