import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { integrationRegistry } from "@/lib/integrations";
import type { InboundAttachment } from "@/lib/integrations/types";
import {
  processInboundAttachments,
  formatFileResults,
} from "@/lib/integrations/chat/file-handler";

/**
 * POST /api/integrations/webhook
 *
 * Universal inbound webhook for chat integrations.
 * Receives messages (with optional file attachments) from external platforms
 * and processes them — downloading files, extracting content via kreuzberg,
 * and ingesting into the RAG knowledge graph.
 *
 * Body shape:
 * {
 *   source: "telegram" | "discord" | "slack" | "whatsapp" | "matrix" | "teams" | ...,
 *   secret: string,          // webhook secret to authenticate the request
 *   senderId: string,
 *   senderName?: string,
 *   content: string,
 *   attachments?: InboundAttachment[],
 *   metadata?: Record<string, unknown>,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      source,
      secret,
      senderId,
      senderName,
      content,
      attachments,
      metadata,
    } = body as {
      source: string;
      secret: string;
      senderId: string;
      senderName?: string;
      content: string;
      attachments?: InboundAttachment[];
      metadata?: Record<string, unknown>;
    };

    if (!source || !secret) {
      return Response.json(
        { error: "Missing required fields: source, secret" },
        { status: 400 }
      );
    }

    // Verify the integration exists
    const definition = integrationRegistry.getDefinition(source);
    if (!definition) {
      return Response.json(
        { error: `Unknown integration: ${source}` },
        { status: 404 }
      );
    }

    // Authenticate via webhook secret stored in skill config
    const config = await prisma.skillConfig.findFirst({
      where: {
        skillId: source,
        enabled: true,
      },
    });

    if (!config) {
      return Response.json(
        { error: `Integration "${source}" is not configured or enabled` },
        { status: 403 }
      );
    }

    // Parse stored config and verify secret
    const storedConfig = config.config ? JSON.parse(config.config as string) : {};
    const webhookSecret =
      storedConfig.webhookSecret ||
      storedConfig.signingSecret ||
      storedConfig.appPassword;

    if (!webhookSecret || webhookSecret !== secret) {
      return Response.json({ error: "Invalid webhook secret" }, { status: 403 });
    }

    // Store the inbound message as a conversation message
    const userId = config.userId;

    // Process file attachments if present
    let fileResults;
    if (attachments && attachments.length > 0) {
      // Determine auth headers for the source platform
      const platformHeaders = getPlatformHeaders(source, storedConfig);

      fileResults = await processInboundAttachments({
        attachments,
        headers: platformHeaders,
        userId,
        source: definition.name,
      });
    }

    // Build response summary
    const response: {
      success: boolean;
      message: string;
      filesProcessed?: number;
      fileSummary?: string;
    } = {
      success: true,
      message: `Received message from ${senderName || senderId} via ${definition.name}`,
    };

    if (fileResults) {
      response.filesProcessed = fileResults.filter((r) => r.success).length;
      response.fileSummary = formatFileResults(fileResults);
    }

    return Response.json(response);
  } catch (error) {
    console.error("Webhook error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * Returns platform-specific auth headers for file downloads.
 */
function getPlatformHeaders(
  source: string,
  config: Record<string, string>
): Record<string, string> {
  switch (source) {
    case "slack":
      return config.botToken
        ? { Authorization: `Bearer ${config.botToken}` }
        : {};
    case "whatsapp":
      return config.accessToken
        ? { Authorization: `Bearer ${config.accessToken}` }
        : {};
    case "discord":
      return config.botToken
        ? { Authorization: `Bot ${config.botToken}` }
        : {};
    case "matrix":
      return config.accessToken
        ? { Authorization: `Bearer ${config.accessToken}` }
        : {};
    case "teams":
      // Teams uses OAuth, the token would need to be refreshed
      return config.accessToken
        ? { Authorization: `Bearer ${config.accessToken}` }
        : {};
    default:
      return {};
  }
}
