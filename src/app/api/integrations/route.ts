import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { integrationRegistry } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/integrations
 * List all available integrations with their connection status for the current user.
 */
export async function GET() {
  try {
    const session = await requireSession();

    const definitions = integrationRegistry.getAllDefinitions();

    // Get user's configured integrations
    const configs = await prisma.skillConfig.findMany({
      where: { userId: session.user.id },
    });
    const configMap = new Map(configs.map((c) => [c.skillId, c]));

    const integrations = definitions.map((def) => {
      const userConfig = configMap.get(def.id);
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        category: def.category,
        icon: def.icon,
        website: def.website,
        configFields: def.configFields,
        skills: def.skills,
        supportsInbound: def.supportsInbound || false,
        supportsOutbound: def.supportsOutbound || false,
        // User-specific
        enabled: userConfig?.enabled || false,
        configured: !!userConfig,
      };
    });

    return Response.json({ integrations });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/integrations
 * Enable/configure an integration for the current user.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    const { integrationId, enabled, config } = body as {
      integrationId: string;
      enabled: boolean;
      config?: Record<string, unknown>;
    };

    // Verify integration exists
    const def = integrationRegistry.getDefinition(integrationId);
    if (!def) {
      return Response.json({ error: "Integration not found" }, { status: 404 });
    }

    // Upsert user config
    await prisma.skillConfig.upsert({
      where: {
        userId_skillId: {
          userId: session.user.id,
          skillId: integrationId,
        },
      },
      update: {
        enabled,
        config: config ? JSON.stringify(config) : undefined,
      },
      create: {
        userId: session.user.id,
        skillId: integrationId,
        enabled,
        config: config ? JSON.stringify(config) : null,
      },
    });

    // If enabling, try to connect
    if (enabled && config) {
      try {
        const instance = await integrationRegistry.createInstance(
          integrationId,
          config as Record<string, string>
        );
        await instance.connect();
        return Response.json({ status: "connected", integrationId });
      } catch (error) {
        return Response.json({
          status: "error",
          integrationId,
          error: error instanceof Error ? error.message : "Connection failed",
        });
      }
    }

    return Response.json({ status: "ok", integrationId, enabled });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
