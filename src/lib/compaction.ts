import { prisma } from "@/lib/prisma";
import { generateText } from "ai";
import { resolveModelFromSettings } from "@/lib/ai/providers";
import { memoryManager } from "@/lib/rag/memory";

/**
 * Context & Memory — Conversation compaction.
 *
 * When a conversation's message count exceeds a threshold, the oldest
 * messages are summarized by the LLM into a single "system" summary
 * message, then deleted. The summary is also stored as a long-term
 * memory so RAG can retrieve it later.
 *
 * This keeps the context window bounded while preserving knowledge.
 */

const COMPACTION_THRESHOLD = 80; // messages before compaction triggers
const KEEP_RECENT = 20; // messages to keep verbatim (most recent)

/**
 * Check whether a conversation needs compaction and, if so, run it.
 * Safe to call after every message — it no-ops when below threshold.
 */
export async function maybeCompact(conversationId: string, userId: string) {
  const count = await prisma.message.count({ where: { conversationId } });
  if (count <= COMPACTION_THRESHOLD) return;

  await compactConversation(conversationId, userId);
}

/**
 * Compact a conversation: summarize old messages, store summary, delete originals.
 */
export async function compactConversation(
  conversationId: string,
  userId: string
) {
  // Fetch all messages oldest-first
  const allMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  if (allMessages.length <= KEEP_RECENT) return;

  const toSummarize = allMessages.slice(0, allMessages.length - KEEP_RECENT);

  // Build a transcript for the LLM
  const transcript = toSummarize
    .map((m) => {
      const src = m.source ? ` [${m.source}]` : "";
      return `${m.role}${src}: ${m.content}`;
    })
    .join("\n");

  const model = await resolveModelFromSettings();

  const { text: summary } = await generateText({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a summarizer. Condense the following conversation transcript into a concise summary that preserves all key facts, decisions, user preferences, and action items. Use bullet points. Do not add commentary.",
      },
      {
        role: "user",
        content: `Summarize this conversation (${toSummarize.length} messages):\n\n${transcript}`,
      },
    ],
  });

  // Store the summary as a system message at the start of the conversation
  // Check if there's already a compaction summary and update it
  const existingSummary = await prisma.message.findFirst({
    where: {
      conversationId,
      role: "system",
      metadata: "compaction_summary",
    },
  });

  if (existingSummary) {
    await prisma.message.update({
      where: { id: existingSummary.id },
      data: {
        content: `[Conversation summary — earlier messages compacted]\n\n${summary}`,
      },
    });
  } else {
    await prisma.message.create({
      data: {
        conversationId,
        role: "system",
        content: `[Conversation summary — earlier messages compacted]\n\n${summary}`,
        metadata: "compaction_summary",
      },
    });
  }

  // Persist summary as long-term memory for RAG recall
  try {
    await memoryManager.store({
      userId,
      content: summary,
      type: "long_term",
      tags: ["compaction", "conversation_summary"],
      summary: `Compacted ${toSummarize.length} messages from conversation.`,
    });
  } catch {
    // Best-effort
  }

  // Delete the old messages
  const idsToDelete = toSummarize.map((m) => m.id);
  await prisma.message.deleteMany({
    where: { id: { in: idsToDelete } },
  });

  console.log(
    `[compaction] Compacted ${idsToDelete.length} messages in conversation ${conversationId}`
  );
}
