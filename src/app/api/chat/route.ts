import { NextRequest } from "next/server";
import { convertToCoreMessages, generateText } from "ai";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { streamAgentResponse } from "@/lib/ai/agent";
import { memoryManager } from "@/lib/rag/memory";
import { maybeCompact } from "@/lib/compaction";
import { resolveModelFromSettings } from "@/lib/ai/providers";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.chat");

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const userId = session.user.id;

    log.info("POST /api/chat started", { userId });

    const body = await req.json();
    const {
      messages,
      conversationId,
    }: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: any[];
      conversationId?: string;
    } = body;

    log.debug("Request payload", {
      messageCount: messages?.length ?? 0,
      conversationId: conversationId ?? null,
    });

    if (!messages || messages.length === 0) {
      log.warn("Empty messages array received", { userId });
      return Response.json({ error: "Messages are required" }, { status: 400 });
    }

    // Get or create conversation
    let convId = conversationId;
    const isNewConversation = !convId;
    if (!convId) {
      const firstContent = typeof messages[0]?.content === "string"
        ? messages[0].content
        : "";
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          title: firstContent.slice(0, 100) || "New Conversation",
        },
      });
      convId = conversation.id;
      log.info("New conversation created", { convId, userId });
    }

    // Save the user message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "user") {
      const content = typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);
      await prisma.message.create({
        data: {
          conversationId: convId,
          role: "user",
          content,
          source: "web",
        },
      });
      log.debug("User message saved", { conversationId: convId });
    }

    // Recall relevant memories for context
    let memoryContext: string | undefined;
    try {
      log.debug("Attempting memory recall", { userId });
      const userQuery = messages
        .filter((m: { role: string }) => m.role === "user")
        .map((m: { content: unknown }) =>
          typeof m.content === "string" ? m.content : ""
        )
        .slice(-3)
        .join(" ");
      memoryContext = await memoryManager.recall({
        userId,
        query: userQuery,
        limit: 5,
      });
    } catch (err) {
      log.warn("Memory recall failed", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Memory recall is best-effort
    }

    // Convert UI messages from useChat to core messages for the AI SDK
    const coreMessages = convertToCoreMessages(messages);
    log.debug("Core messages converted", { coreMessageCount: coreMessages.length });

    // Stream the AI response
    log.info("Starting AI stream", {
      userId,
      conversationId: convId,
      messageCount: coreMessages.length,
    });

    const result = await streamAgentResponse({
      messages: coreMessages,
      userId,
      conversationId: convId,
      memoryContext: memoryContext || undefined,
    });

    // Save assistant response after stream completes (non-blocking)
    result.text.then(async (text) => {
      const streamDuration = Date.now() - startTime;
      log.info("AI stream complete", {
        responseLength: text?.length ?? 0,
        durationMs: streamDuration,
        conversationId: convId,
      });

      if (text) {
        try {
          await prisma.message.create({
            data: {
              conversationId: convId!,
              role: "assistant",
              content: text,
              source: "web",
            },
          });
          log.debug("Assistant message saved", { conversationId: convId });
        } catch (err) {
          log.error("Failed to save assistant message", {
            conversationId: convId,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Auto-save short-term memory of the interaction
        try {
          const userContent = typeof lastMessage?.content === "string"
            ? lastMessage.content
            : "";
          await memoryManager.store({
            userId,
            content: `User asked: "${userContent.slice(0, 200)}"\nAssistant responded about: ${text.slice(0, 200)}`,
            type: "short_term",
          });
          log.debug("Memory stored successfully", { userId, conversationId: convId });
        } catch (err) {
          log.warn("Memory store failed", {
            userId,
            conversationId: convId,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Generate an AI title for new conversations
        if (isNewConversation) {
          try {
            log.debug("Generating title for new conversation", { conversationId: convId });
            const userContent = typeof lastMessage?.content === "string"
              ? lastMessage.content
              : "";
            const titleResult = await generateText({
              model: await resolveModelFromSettings(),
              messages: [
                {
                  role: "system",
                  content:
                    "Generate a concise title (max 50 chars) for this conversation. Reply with ONLY the title, no quotes or punctuation at the end.",
                },
                {
                  role: "user",
                  content: `User: "${userContent.slice(0, 300)}"\nAssistant: "${text.slice(0, 300)}"`,
                },
              ],
            });
            const title = titleResult.text.trim().slice(0, 80);
            if (title) {
              await prisma.conversation.update({
                where: { id: convId! },
                data: { title },
              });
              log.info("Conversation title generated", { conversationId: convId, title });
            }
          } catch (err) {
            log.warn("Title generation failed", {
              conversationId: convId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Compact conversation if it has grown too large
        try {
          await maybeCompact(convId!, userId);
        } catch (err) {
          log.warn("Compaction failed", {
            conversationId: convId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });

    log.info("Returning stream response", { conversationId: convId, userId });

    return result.toDataStreamResponse({
      headers: {
        "X-Conversation-Id": convId,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    if (error instanceof Error && error.message === "Unauthorized") {
      log.warn("Unauthorized request", { durationMs: duration });
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    log.error("Chat error", {
      durationMs: duration,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
