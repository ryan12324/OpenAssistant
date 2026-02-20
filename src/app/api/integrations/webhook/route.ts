import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { integrationRegistry } from "@/lib/integrations";
import type { InboundAttachment } from "@/lib/integrations/types";
import {
  processInboundAttachments,
  formatFileResults,
} from "@/lib/integrations/chat/file-handler";
import { resolveConversation, loadConversationHistory } from "@/lib/channels";
import { generateAgentResponse } from "@/lib/ai/agent";
import { memoryManager } from "@/lib/rag/memory";

/**
 * POST /api/integrations/webhook
 *
 * Universal inbound webhook for chat integrations.
 * Receives messages (with optional file attachments) from external platforms,
 * routes them through the AI agent pipeline (sharing context with all other
 * channels), and returns the AI response so the caller can relay it back.
 *
 * Body shape:
 * {
 *   source: "telegram" | "discord" | "slack" | "whatsapp" | "matrix" | "teams" | ...,
 *   secret: string,          // webhook secret to authenticate the request
 *   senderId: string,
 *   senderName?: string,
 *   content: string,
 *   externalChatId?: string, // platform chat/channel ID (for channel linking)
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

    const userId = config.userId;

    // ── Process file attachments (if any) ──────────────────────
    let fileResults;
    if (attachments && attachments.length > 0) {
      const platformHeaders = getPlatformHeaders(source, storedConfig);
      fileResults = await processInboundAttachments({
        attachments,
        headers: platformHeaders,
        userId,
        source: definition.name,
      });
    }

    // ── Route text message through the AI pipeline ─────────────
    let aiReply: string | undefined;
    if (content) {
      // Resolve (or create) a conversation for this platform channel.
      // Uses externalChatId if provided, otherwise falls back to senderId
      // so each unique sender/channel gets a stable conversation.
      const chatId = externalChatId || senderId;
      const conversationId = await resolveConversation({
        userId,
        platform: source,
        externalId: chatId,
        title: senderName
          ? `${definition.name}: ${senderName}`
          : `${definition.name} conversation`,
      });

      // Load existing conversation history for shared context
      const history = await loadConversationHistory(conversationId);

      // Save the inbound message
      await prisma.message.create({
        data: {
          conversationId,
          role: "user",
          content,
          source,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });

      // Recall memories for context
      let memoryContext: string | undefined;
      try {
        const queryText = [...history.filter((m) => m.role === "user").map((m) => m.content).slice(-2), content].join(" ");
        memoryContext = await memoryManager.recall({
          userId,
          query: queryText,
          limit: 5,
        });
      } catch {
        // Memory recall is best-effort
      }

      // Build message list: history + new message
      const messages: { role: "user" | "assistant"; content: string }[] = [
        ...history,
        { role: "user", content },
      ];

      // Generate AI response (non-streaming for webhook)
      aiReply = await generateAgentResponse({
        messages,
        userId,
        conversationId,
        memoryContext,
      });

      // Save the assistant response
      if (aiReply) {
        await prisma.message.create({
          data: {
            conversationId,
            role: "assistant",
            content: aiReply,
            source,
          },
        });

        // Auto-save short-term memory
        try {
          await memoryManager.store({
            userId,
            content: `User asked (via ${definition.name}): "${content.slice(0, 200)}"\nAssistant responded: ${aiReply.slice(0, 200)}`,
            type: "short_term",
          });
        } catch {
          // Best-effort
        }
      }
    }

    // ── Build response ─────────────────────────────────────────
    const response: {
      success: boolean;
      message: string;
      reply?: string;
      filesProcessed?: number;
      fileSummary?: string;
    } = {
      success: true,
      message: `Received message from ${senderName || senderId} via ${definition.name}`,
    };

    if (aiReply) {
      response.reply = aiReply;
    }

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
      return config.accessToken
        ? { Authorization: `Bearer ${config.accessToken}` }
        : {};
    default:
      return {};
  }
}
