import { prisma } from "@/lib/prisma";
import { getLogger } from "@/lib/logger";

const log = getLogger("queue");

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
  log.info("Enqueuing job", { type, userId: userId ?? null });
  const job = await prisma.job.create({
    data: {
      type,
      payload: JSON.stringify(payload),
      userId: userId ?? null,
    },
  });
  log.info("Job enqueued", { jobId: job.id, type, userId: userId ?? null });
  // Nudge the poller (non-blocking)
  tickPoller();
  return job.id;
}

/**
 * Claim the next pending job (oldest first), atomically marking it
 * "processing". Returns null if the queue is empty.
 */
export async function dequeue() {
  log.debug("Attempting to dequeue next pending job");
  // Prisma doesn't support UPDATE ... RETURNING with a WHERE on status,
  // so we use a two-step read-then-update within a transaction.
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
    });
    if (!job) {
      log.debug("Queue is empty, no pending jobs");
      return null;
    }

    const updated = await tx.job.update({
      where: { id: job.id },
      data: { status: "processing", attempts: job.attempts + 1 },
    });
    log.info("Job claimed for processing", {
      jobId: updated.id,
      type: updated.type,
      attempt: updated.attempts,
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
  log.info("Job completed", { jobId });
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
    log.warn("Job failed, will retry", {
      jobId,
      type: job.type,
      attempt: job.attempts,
      maxRetries: job.maxRetries,
      error,
    });
  } else {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "failed", error },
    });
    log.error("Job permanently failed, max retries exhausted", {
      jobId,
      type: job.type,
      attempt: job.attempts,
      maxRetries: job.maxRetries,
      error,
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
  log.info("Job handler registered");
}

/** Nudge the poller to check for work immediately. */
function tickPoller() {
  log.debug("Poller tick requested");
  if (polling || !handler) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(poll, 0);
}

/** Start the background poll loop. */
export function startPoller() {
  if (!handler) {
    log.warn("No handler registered — call registerHandler() first");
    return;
  }
  log.info("Starting background poller", { intervalMs: POLL_INTERVAL_MS });
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

    const startMs = Date.now();
    try {
      log.info("Processing job", { jobId: job.id, type: job.type });
      const payload = JSON.parse(job.payload);
      const result = await handler(job.type, payload);
      await complete(job.id, result);
      const durationMs = Date.now() - startMs;
      log.info("Job processed successfully", {
        jobId: job.id,
        type: job.type,
        durationMs,
      });
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const msg = err instanceof Error ? err.message : String(err);
      log.error("Job processing failed", {
        jobId: job.id,
        type: job.type,
        durationMs,
        error: msg,
      });
      await fail(job.id, msg);
    }

    // Immediately check for more work
    polling = false;
    tickPoller();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Poller error", { error: msg });
    polling = false;
    schedulePoll();
  }
}
