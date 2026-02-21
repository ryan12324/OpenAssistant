import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { getLogger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";

const log = getLogger("api.conversations");

export async function GET() {
  try {
    log.info("Listing conversations");
    const session = await requireSession();

    const conversations = await prisma.conversation.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { id: true, role: true, content: true, source: true, createdAt: true },
        },
        channelLinks: {
          select: { platform: true, externalId: true },
        },
      },
    });

    log.info("Conversations listed successfully", { count: conversations.length });
    return Response.json(conversations);
  } catch (error) {
    return handleApiError(error, "list conversations");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const { conversationId } = await req.json();

    log.info("Deleting conversation", { conversationId });

    await prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
    });

    log.info("Conversation deleted successfully", { conversationId });
    return Response.json({ status: "ok" });
  } catch (error) {
    return handleApiError(error, "delete conversation");
  }
}
