import { prisma } from "@/lib/prisma";

/**
 * Gateway Pattern — SQLite-backed persistent job queue.
 *
 * Inbound webhook messages (and other async tasks) are enqueued here so the
 * HTTP handler returns immediately. A poller picks up pending jobs and
 * processes them with retry + dead-letter semantics.
 *
 * This is intentionally simple (no Redis/RabbitMQ) so the whole stack runs
 * on a single machine with zero extra infra.
 */

export type JobType = "inbound_message" | "compact_conversation";

export interface InboundMessagePayload {
  source: string;
  senderId: string;
  senderName?: string;
  content: string;
  externalChatId?: string;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
  userId: string;
  storedConfig: Record<string, string>;
  definitionName: string;
}

export interface CompactConversationPayload {
  conversationId: string;
  userId: string;
}

type JobPayload = InboundMessagePayload | CompactConversationPayload;

// ── Public API ─────────────────────────────────────────────

/** Enqueue a job. Returns the job ID. */
export async function enqueue(
  type: JobType,
  payload: JobPayload,
  userId?: string
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      type,
      payload: JSON.stringify(payload),
      userId: userId ?? null,
    },
  });
  // Nudge the poller (non-blocking)
  tickPoller();
  return job.id;
}

/**
 * Claim the next pending job (oldest first), atomically marking it
 * "processing". Returns null if the queue is empty.
 */
export async function dequeue() {
  // Prisma doesn't support UPDATE ... RETURNING with a WHERE on status,
  // so we use a two-step read-then-update within a transaction.
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
    });
    if (!job) return null;

    const updated = await tx.job.update({
      where: { id: job.id },
      data: { status: "processing", attempts: job.attempts + 1 },
    });
    return updated;
  });
}

/** Mark a job as completed with an optional result. */
export async function complete(jobId: string, result?: unknown) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "completed",
      result: result ? JSON.stringify(result) : null,
    },
  });
}

/** Mark a job as failed. Re-enqueues if under maxRetries. */
export async function fail(jobId: string, error: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  if (job.attempts < job.maxRetries) {
    // Back to pending for retry
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "pending", error },
    });
  } else {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "failed", error },
    });
  }
}

// ── Background Poller ──────────────────────────────────────

type JobHandler = (type: string, payload: unknown) => Promise<unknown>;

let handler: JobHandler | null = null;
let polling = false;
let timer: ReturnType<typeof setTimeout> | null = null;

const POLL_INTERVAL_MS = 2_000;

/** Register the function that processes jobs. Call once at app startup. */
export function registerHandler(fn: JobHandler) {
  handler = fn;
}

/** Nudge the poller to check for work immediately. */
function tickPoller() {
  if (polling || !handler) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(poll, 0);
}

/** Start the background poll loop. */
export function startPoller() {
  if (!handler) {
    console.warn("[queue] No handler registered — call registerHandler() first");
    return;
  }
  schedulePoll();
}

function schedulePoll() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(poll, POLL_INTERVAL_MS);
}

async function poll() {
  if (polling || !handler) {
    schedulePoll();
    return;
  }
  polling = true;

  try {
    const job = await dequeue();
    if (!job) {
      polling = false;
      schedulePoll();
      return;
    }

    try {
      const payload = JSON.parse(job.payload);
      const result = await handler(job.type, payload);
      await complete(job.id, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[queue] Job ${job.id} (${job.type}) failed:`, msg);
      await fail(job.id, msg);
    }

    // Immediately check for more work
    polling = false;
    tickPoller();
  } catch (err) {
    console.error("[queue] Poller error:", err);
    polling = false;
    schedulePoll();
  }
}
