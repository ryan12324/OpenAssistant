import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { streamAgentResponse } from "@/lib/ai/agent";
import { memoryManager } from "@/lib/rag/memory";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const body = await req.json();
    const {
      messages,
      conversationId,
    }: {
      messages: { role: "user" | "assistant"; content: string }[];
      conversationId?: string;
    } = body;

    if (!messages || messages.length === 0) {
      return Response.json({ error: "Messages are required" }, { status: 400 });
    }

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const conversation = await prisma.conversation.create({
        data: {
          userId,
          title:
            messages[0]?.content.slice(0, 100) || "New Conversation",
        },
      });
      convId = conversation.id;
    }

    // Save the user message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "user") {
      await prisma.message.create({
        data: {
          conversationId: convId,
          role: "user",
          content: lastMessage.content,
        },
      });
    }

    // Recall relevant memories for context
    let memoryContext: string | undefined;
    try {
      const userQuery = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
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

    // Stream the AI response
    const result = streamAgentResponse({
      messages,
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
          },
        });

        // Auto-save short-term memory of the interaction
        try {
          await memoryManager.store({
            userId,
            content: `User asked: "${lastMessage?.content?.slice(0, 200)}"\nAssistant responded about: ${text.slice(0, 200)}`,
            type: "short_term",
          });
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
