import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { integrationRegistry } from "@/lib/integrations";
import type { InboundAttachment } from "@/lib/integrations/types";
import {
  processInboundAttachments,
  formatFileResults,
} from "@/lib/integrations/chat/file-handler";
import { enqueue, type InboundMessagePayload } from "@/lib/queue";
import { audit } from "@/lib/audit";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.webhook");

/**
 * POST /api/integrations/webhook
 *
 * Gateway Pattern — Universal inbound webhook for chat integrations.
 *
 * Auth & validation happen synchronously (fast). The heavy AI processing
 * is enqueued to the job queue so this handler returns immediately.
 *
 * For callers that need the AI reply synchronously (e.g. Telegram inline
 * bots), pass `?sync=true` to process in-band and receive the reply in
 * the response body.
 *
 * Body shape:
 * {
 *   source: "telegram" | "discord" | "slack" | "whatsapp" | "matrix" | "teams" | ...,
 *   secret: string,
 *   senderId: string,
 *   senderName?: string,
 *   content: string,
 *   externalChatId?: string,
 *   attachments?: InboundAttachment[],
 *   metadata?: Record<string, unknown>,
 * }
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const sync = req.nextUrl.searchParams.get("sync") === "true";

    const {
      source,
      secret,
      senderId,
      senderName,
      content,
      externalChatId,
      attachments,
      metadata,
    } = body as {
      source: string;
      secret: string;
      senderId: string;
      senderName?: string;
      content: string;
      externalChatId?: string;
      attachments?: InboundAttachment[];
      metadata?: Record<string, unknown>;
    };

    log.info("Inbound webhook received", {
      source,
      senderId,
      sync,
      contentLength: content?.length ?? 0,
    });

    if (!source || !secret) {
      log.warn("Missing required fields", { source: !!source, secret: !!secret });
      return Response.json(
        { error: "Missing required fields: source, secret" },
        { status: 400 }
      );
    }

    // Verify the integration exists
    const definition = integrationRegistry.getDefinition(source);
    if (!definition) {
      log.warn("Unknown integration source", { source });
      return Response.json(
        { error: `Unknown integration: ${source}` },
        { status: 404 }
      );
    }

    // Authenticate via webhook secret stored in skill config
    const config = await prisma.skillConfig.findFirst({
      where: { skillId: source, enabled: true },
    });

    if (!config) {
      log.warn("Integration not configured or not enabled", { source });
      return Response.json(
        { error: `Integration "${source}" is not configured or enabled` },
        { status: 403 }
      );
    }

    const storedConfig = config.config ? JSON.parse(config.config as string) : {};
    const webhookSecret =
      storedConfig.webhookSecret ||
      storedConfig.signingSecret ||
      storedConfig.appPassword;

    if (!webhookSecret || webhookSecret !== secret) {
      log.warn("Invalid webhook secret", { source, senderId });
      return Response.json({ error: "Invalid webhook secret" }, { status: 403 });
    }

    const userId = config.userId;

    log.debug("Webhook authentication successful", { source, userId });

    // Audit the inbound event
    audit({
      userId,
      action: "inbound_message",
      source,
      input: { senderId, senderName, contentLength: content?.length, hasAttachments: !!attachments?.length },
    });

    // ── Process file attachments synchronously (lightweight) ───
    let fileResults;
    if (attachments && attachments.length > 0) {
      log.info("Processing inbound attachments", {
        source,
        attachmentCount: attachments.length,
      });
      const platformHeaders = getPlatformHeaders(source, storedConfig);
      fileResults = await processInboundAttachments({
        attachments,
        headers: platformHeaders,
        userId,
        source: definition.name,
      });
      log.info("Attachment processing complete", {
        total: attachments.length,
        succeeded: fileResults.filter((r) => r.success).length,
      });
    }

    // ── Enqueue or process text message ────────────────────────
    let aiReply: string | undefined;
    let jobId: string | undefined;

    if (content) {
      const payload: InboundMessagePayload = {
        source,
        senderId,
        senderName,
        content,
        externalChatId,
        attachments: attachments as unknown[],
        metadata,
        userId,
        storedConfig,
        definitionName: definition.name,
      };

      if (sync) {
        // Synchronous path: process in-band for callers that need the reply
        const syncStart = Date.now();
        const { processInboundMessage } = await import("@/lib/worker");
        const result = await processInboundMessage(payload);
        aiReply = result?.reply;
        log.info("Synchronous processing complete", {
          source,
          senderId,
          durationMs: Date.now() - syncStart,
          hasReply: !!aiReply,
        });
      } else {
        // Async path: enqueue and return immediately (Gateway Pattern)
        const enqueueStart = Date.now();
        jobId = await enqueue("inbound_message", payload, userId);
        log.info("Message enqueued for async processing", {
          source,
          senderId,
          jobId,
          durationMs: Date.now() - enqueueStart,
        });
      }
    }

    // ── Build response ─────────────────────────────────────────
    const response: {
      success: boolean;
      message: string;
      jobId?: string;
      reply?: string;
      filesProcessed?: number;
      fileSummary?: string;
    } = {
      success: true,
      message: `Received message from ${senderName || senderId} via ${definition.name}`,
    };

    if (jobId) response.jobId = jobId;
    if (aiReply) response.reply = aiReply;
    if (fileResults) {
      response.filesProcessed = fileResults.filter((r) => r.success).length;
      response.fileSummary = formatFileResults(fileResults);
    }

    log.info("Webhook response sent", {
      source,
      senderId,
      success: true,
      totalDurationMs: Date.now() - startTime,
      filesProcessed: response.filesProcessed,
      hasReply: !!response.reply,
      jobId: response.jobId,
    });

    return Response.json(response);
  } catch (error) {
    log.error("Webhook processing failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: Date.now() - startTime,
    });
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
      return config.accessToken
        ? { Authorization: `Bearer ${config.accessToken}` }
        : {};
    default:
      return {};
  }
}
