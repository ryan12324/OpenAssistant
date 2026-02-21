import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { integrationRegistry } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { getLogger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";

const log = getLogger("api.integrations");

/**
 * GET /api/integrations
 * List all available integrations with their connection status for the current user.
 */
export async function GET() {
  try {
    log.info("Listing integrations for current user");

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

    const enabledCount = integrations.filter((i) => i.enabled).length;
    log.info("Integrations listed successfully", {
      total: integrations.length,
      enabled: enabledCount,
    });

    return Response.json({ integrations });
  } catch (error) {
    return handleApiError(error, "list integrations");
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

    log.info("Configuring integration", { integrationId, enabled });

    // Verify integration exists
    const def = integrationRegistry.getDefinition(integrationId);
    if (!def) {
      log.warn("Integration not found", { integrationId });
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

    log.debug("Upserted skill config", { integrationId, userId: session.user.id });

    // Invalidate hydration cache so integration changes take effect immediately
    integrationRegistry.invalidateUser(session.user.id);

    log.debug("Invalidated hydration cache", { userId: session.user.id });

    // If enabling, try to connect
    if (enabled && config) {
      try {
        const instance = await integrationRegistry.createUserInstance(
          session.user.id,
          integrationId,
          config as Record<string, string>
        );
        await instance.connect();
        log.info("Integration connected successfully", { integrationId });
        return Response.json({ status: "connected", integrationId });
      } catch (error) {
        log.error("Integration connection failed", {
          integrationId,
          error: error instanceof Error ? error.message : "Connection failed",
        });
        return Response.json({
          status: "error",
          integrationId,
          error: error instanceof Error ? error.message : "Connection failed",
        });
      }
    }

    log.info("Integration saved", { integrationId, enabled });
    return Response.json({ status: "ok", integrationId, enabled });
  } catch (error) {
    return handleApiError(error, "configure integration");
  }
}
