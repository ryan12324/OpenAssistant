import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { mcpManager } from "@/lib/mcp/client";
import { loadGlobalMcpServers } from "@/lib/mcp/global-config";
import { getToolPermissionLabel } from "@/lib/mcp/permissions";

/**
 * GET /api/mcp — List all MCP servers for the current user.
 * Returns per-user servers (from DB) and global servers (from config file),
 * along with their connection status and discovered tools.
 */
export async function GET() {
  try {
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
      return {
        id: row.id,
        name: row.name,
        transport: row.transport,
        command: row.command,
        args: row.args ? JSON.parse(row.args) : null,
        url: row.url,
        enabled: row.enabled,
        scope: "user",
        status: live?.status ?? (row.enabled ? "disconnected" : "disabled"),
        error: live?.error ?? null,
        tools: (live?.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          permission: getToolPermissionLabel(t),
        })),
        connectedAt: live?.connectedAt ?? null,
      };
    });

    // Global servers (read-only)
    const globalConfigs = await loadGlobalMcpServers();
    const globalServers = globalConfigs.map((config) => {
      const live = states.find((s) => s.config.id === config.id);
      return {
        id: config.id,
        name: config.name,
        transport: config.transport,
        command: config.command,
        url: config.url,
        enabled: config.enabled,
        scope: "global",
        status: live?.status ?? "disconnected",
        error: live?.error ?? null,
        tools: (live?.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          permission: getToolPermissionLabel(t),
        })),
        connectedAt: live?.connectedAt ?? null,
      };
    });

    return Response.json({ servers: [...userServers, ...globalServers] });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("MCP list error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
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

    if (!name || !transport) {
      return Response.json(
        { error: "name and transport are required" },
        { status: 400 }
      );
    }

    if (transport === "stdio" && !command) {
      return Response.json(
        { error: "command is required for stdio transport" },
        { status: 400 }
      );
    }

    if (transport === "http" && !url) {
      return Response.json(
        { error: "url is required for http transport" },
        { status: 400 }
      );
    }

    // Upsert the server config
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("MCP create error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
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

    if (!body.id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    // Verify ownership
    const row = await prisma.mcpServer.findFirst({
      where: { id: body.id, userId },
    });

    if (!row) {
      return Response.json({ error: "Server not found" }, { status: 404 });
    }

    // Disconnect and delete
    await mcpManager.invalidateUser(userId);
    await prisma.mcpServer.delete({ where: { id: body.id } });

    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("MCP delete error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
