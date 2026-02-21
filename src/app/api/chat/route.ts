import { NextRequest } from "next/server";
import { convertToCoreMessages, generateText } from "ai";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { streamAgentResponse } from "@/lib/ai/agent";
import { memoryManager } from "@/lib/rag/memory";
import { maybeCompact } from "@/lib/compaction";
import { resolveModelFromSettings } from "@/lib/ai/providers";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const body = await req.json();
    const {
      messages,
      conversationId,
    }: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: any[];
      conversationId?: string;
    } = body;

    if (!messages || messages.length === 0) {
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
    }

    // Recall relevant memories for context
    let memoryContext: string | undefined;
    try {
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
    } catch {
      // Memory recall is best-effort
    }

    // Convert UI messages from useChat to core messages for the AI SDK
    const coreMessages = convertToCoreMessages(messages);

    // Stream the AI response
    const result = await streamAgentResponse({
      messages: coreMessages,
      userId,
      conversationId: convId,
      memoryContext: memoryContext || undefined,
    });

    // Save assistant response after stream completes (non-blocking)
    result.text.then(async (text) => {
      if (text) {
        await prisma.message.create({
          data: {
            conversationId: convId!,
            role: "assistant",
            content: text,
            source: "web",
          },
        });

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
        } catch {
          // Best-effort
        }

        // Generate an AI title for new conversations
        if (isNewConversation) {
          try {
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
            }
          } catch {
            // Title generation is best-effort
          }
        }

        // Compact conversation if it has grown too large
        try {
          await maybeCompact(convId!, userId);
        } catch {
          // Best-effort
        }
      }
    });

    return result.toDataStreamResponse({
      headers: {
        "X-Conversation-Id": convId,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Chat error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
