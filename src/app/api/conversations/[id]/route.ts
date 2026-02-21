import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.conversations");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    log.info("Fetching conversation", { id });

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      log.warn("Conversation not found", { id });
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    log.debug("Conversation fetched successfully", { id, messageCount: conversation.messages.length });
    return Response.json(conversation);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      log.warn("Unauthorized request to fetch conversation");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    log.error("Failed to fetch conversation", { error });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
