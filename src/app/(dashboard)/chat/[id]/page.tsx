import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { ChatView } from "@/components/chat/chat-view";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;

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
    notFound();
  }

  const messages = conversation.messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: m.content }],
  }));

  return (
    <ChatView conversationId={conversation.id} initialMessages={messages} />
  );
}
