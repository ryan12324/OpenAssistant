import { prisma } from "@/lib/prisma";
import { resolveConversation, loadConversationHistory } from "@/lib/channels";
import { generateAgentResponse } from "@/lib/ai/agent";
import { memoryManager } from "@/lib/rag/memory";
import { maybeCompact } from "@/lib/compaction";
import { audit } from "@/lib/audit";
import { registerHandler, startPoller, type InboundMessagePayload, type CompactConversationPayload } from "@/lib/queue";

/**
 * Gateway Pattern — Background job worker.
 *
 * Handles all async job types dispatched by the queue. Each handler is
 * a pure function that takes a typed payload and returns a result.
 *
 * Call `initWorker()` once at app startup to register handlers and
 * start the background poller.
 */

// ── Job Handlers ───────────────────────────────────────────

/**
 * Process an inbound message from an external platform:
 * resolve conversation, load shared context, run AI, save everything.
 */
export async function processInboundMessage(
  payload: InboundMessagePayload
): Promise<{ reply?: string; conversationId: string }> {
  const {
    source,
    senderId,
    senderName,
    content,
    externalChatId,
    metadata,
    userId,
    definitionName,
  } = payload;

  // Resolve (or create) a conversation for this platform channel
  const chatId = externalChatId || senderId;
  const conversationId = await resolveConversation({
    userId,
    platform: source,
    externalId: chatId,
    title: senderName
      ? `${definitionName}: ${senderName}`
      : `${definitionName} conversation`,
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
    const queryText = [
      ...history
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .slice(-2),
      content,
    ].join(" ");
    memoryContext = await memoryManager.recall({
      userId,
      query: queryText,
      limit: 5,
    });
  } catch {
    // Best-effort
  }

  // Build message list: history + new message
  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...history,
    { role: "user", content },
  ];

  // Generate AI response (non-streaming for async processing)
  const startMs = Date.now();
  const aiReply = await generateAgentResponse({
    messages,
    userId,
    conversationId,
    memoryContext,
  });
  const durationMs = Date.now() - startMs;

  // Audit the outbound reply
  audit({
    userId,
    action: "outbound_reply",
    source,
    input: { contentLength: content.length },
    output: { replyLength: aiReply?.length },
    durationMs,
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
        content: `User asked (via ${definitionName}): "${content.slice(0, 200)}"\nAssistant responded: ${aiReply.slice(0, 200)}`,
        type: "short_term",
      });
    } catch {
      // Best-effort
    }
  }

  // Compact conversation if it has grown too large
  try {
    await maybeCompact(conversationId, userId);
  } catch {
    // Best-effort
  }

  return { reply: aiReply, conversationId };
}

/**
 * Compact a conversation (triggered by queue or cron).
 */
async function processCompaction(payload: CompactConversationPayload) {
  const { compactConversation } = await import("@/lib/compaction");
  await compactConversation(payload.conversationId, payload.userId);
  return { compacted: true };
}

// ── Dispatcher ─────────────────────────────────────────────

async function handleJob(type: string, payload: unknown): Promise<unknown> {
  switch (type) {
    case "inbound_message":
      return processInboundMessage(payload as InboundMessagePayload);
    case "compact_conversation":
      return processCompaction(payload as CompactConversationPayload);
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}

// ── Startup ────────────────────────────────────────────────

let initialized = false;

/** Call once at app startup to register the job handler and start polling. */
export function initWorker() {
  if (initialized) return;
  initialized = true;
  registerHandler(handleJob);
  startPoller();
  console.log("[worker] Background job worker started");
}
