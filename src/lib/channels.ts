import { prisma } from "@/lib/prisma";

/**
 * Resolve an external platform channel to an internal conversation.
 *
 * If a ChannelLink already exists for (userId, platform, externalId), return its
 * conversationId. Otherwise create a new Conversation and ChannelLink together.
 *
 * This is the single entry-point that ensures inbound messages from different
 * platforms share the same conversation when they map to the same external
 * channel, and that all conversations belong to the authenticated user.
 */
export async function resolveConversation(params: {
  userId: string;
  platform: string;
  externalId: string;
  title?: string;
}): Promise<string> {
  const { userId, platform, externalId, title } = params;

  // Fast path: existing link
  const existing = await prisma.channelLink.findUnique({
    where: {
      userId_platform_externalId: { userId, platform, externalId },
    },
  });

  if (existing) {
    return existing.conversationId;
  }

  // Create conversation + link in a transaction
  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title: title || `${platform} conversation`,
      channelLinks: {
        create: { userId, platform, externalId },
      },
    },
  });

  return conversation.id;
}

/**
 * Load recent messages for a conversation (for context window).
 */
export async function loadConversationHistory(
  conversationId: string,
  limit = 50
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true },
  });

  // Return in chronological order
  return messages
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}
