import { prisma } from "@/lib/prisma";
import { resolveConversation, loadConversationHistory } from "@/lib/channels";
import { generateAgentResponse } from "@/lib/ai/agent";
import { memoryManager } from "@/lib/rag/memory";
import { maybeCompact } from "@/lib/compaction";
import { audit } from "@/lib/audit";
import { registerHandler, startPoller, type InboundMessagePayload, type CompactConversationPayload } from "@/lib/queue";
import { getLogger } from "@/lib/logger";

const log = getLogger("worker");

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

  const jobLog = log.child({ source, senderId, userId, definitionName });

  jobLog.info("Processing inbound message", { contentLength: content.length });

  // Resolve (or create) a conversation for this platform channel
  const chatId = externalChatId || senderId;
  jobLog.debug("Resolving conversation", { chatId, externalChatId });
  const conversationId = await resolveConversation({
    userId,
    platform: source,
    externalId: chatId,
    title: senderName
      ? `${definitionName}: ${senderName}`
      : `${definitionName} conversation`,
  });
  jobLog.info("Conversation resolved", { conversationId });

  // Load existing conversation history for shared context
  jobLog.debug("Loading conversation history", { conversationId });
  const history = await loadConversationHistory(conversationId);
  jobLog.info("Conversation history loaded", { conversationId, historyLength: history.length });

  // Save the inbound message
  jobLog.debug("Saving inbound message", { conversationId });
  await prisma.message.create({
    data: {
      conversationId,
      role: "user",
      content,
      source,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
  jobLog.info("Inbound message saved", { conversationId });

  // Recall memories for context
  let memoryContext: string | undefined;
  try {
    jobLog.debug("Recalling memories", { conversationId });
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
    jobLog.info("Memories recalled", { conversationId, hasMemoryContext: !!memoryContext });
  } catch (err) {
    // Best-effort
    jobLog.warn("Memory recall failed (best-effort)", { conversationId, error: String(err) });
  }

  // Build message list: history + new message
  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...history,
    { role: "user", content },
  ];

  // Generate AI response (non-streaming for async processing)
  jobLog.debug("Generating AI response", { conversationId, messageCount: messages.length });
  const startMs = Date.now();
  const aiReply = await generateAgentResponse({
    messages,
    userId,
    conversationId,
    memoryContext,
  });
  const durationMs = Date.now() - startMs;
  jobLog.info("AI response generated", { conversationId, durationMs, replyLength: aiReply?.length });

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
    jobLog.debug("Saving assistant response", { conversationId });
    await prisma.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: aiReply,
        source,
      },
    });
    jobLog.info("Assistant response saved", { conversationId });

    // Auto-save short-term memory
    try {
      jobLog.debug("Storing short-term memory", { conversationId });
      await memoryManager.store({
        userId,
        content: `User asked (via ${definitionName}): "${content.slice(0, 200)}"\nAssistant responded: ${aiReply.slice(0, 200)}`,
        type: "short_term",
      });
      jobLog.info("Short-term memory stored", { conversationId });
    } catch (err) {
      // Best-effort
      jobLog.warn("Memory store failed (best-effort)", { conversationId, error: String(err) });
    }
  }

  // Compact conversation if it has grown too large
  try {
    jobLog.debug("Checking compaction", { conversationId });
    await maybeCompact(conversationId, userId);
    jobLog.debug("Compaction check complete", { conversationId });
  } catch (err) {
    // Best-effort
    jobLog.warn("Compaction check failed (best-effort)", { conversationId, error: String(err) });
  }

  jobLog.info("Inbound message processing complete", { conversationId, hasReply: !!aiReply });

  return { reply: aiReply, conversationId };
}

/**
 * Compact a conversation (triggered by queue or cron).
 */
async function processCompaction(payload: CompactConversationPayload) {
  const { conversationId, userId } = payload;
  log.info("Starting conversation compaction", { conversationId, userId });
  const { compactConversation } = await import("@/lib/compaction");
  await compactConversation(conversationId, userId);
  log.info("Conversation compaction complete", { conversationId, userId });
  return { compacted: true };
}

// ── Dispatcher ─────────────────────────────────────────────

async function handleJob(type: string, payload: unknown): Promise<unknown> {
  log.debug("Dispatching job", { type });
  switch (type) {
    case "inbound_message":
      return processInboundMessage(payload as InboundMessagePayload);
    case "compact_conversation":
      return processCompaction(payload as CompactConversationPayload);
    default:
      log.error("Unknown job type", { type });
      throw new Error(`Unknown job type: ${type}`);
  }
}

// ── Startup ────────────────────────────────────────────────

let initialized = false;

/** Call once at app startup to register the job handler and start polling. */
export function initWorker() {
  if (initialized) {
    log.debug("Worker already initialized, skipping");
    return;
  }
  initialized = true;
  registerHandler(handleJob);
  startPoller();
  log.info("Background job worker started");
}
