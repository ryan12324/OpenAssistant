import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockJobCreate,
  mockJobFindFirst,
  mockJobFindUnique,
  mockJobUpdate,
  mockTransaction,
  mockDebug,
  mockInfo,
  mockWarn,
  mockError,
} = vi.hoisted(() => ({
  mockJobCreate: vi.fn(),
  mockJobFindFirst: vi.fn(),
  mockJobFindUnique: vi.fn(),
  mockJobUpdate: vi.fn(),
  mockTransaction: vi.fn(),
  mockDebug: vi.fn(),
  mockInfo: vi.fn(),
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    job: {
      create: (...args: unknown[]) => mockJobCreate(...args),
      findFirst: (...args: unknown[]) => mockJobFindFirst(...args),
      findUnique: (...args: unknown[]) => mockJobFindUnique(...args),
      update: (...args: unknown[]) => mockJobUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    debug: mockDebug,
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dynamically import a fresh queue module (resets private state). */
async function loadQueue() {
  const mod = await import("@/lib/queue");
  return mod;
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    type: "inbound_message",
    payload: JSON.stringify({ source: "test", senderId: "s1", content: "hi", userId: "u1", storedConfig: {}, definitionName: "d1" }),
    status: "pending",
    attempts: 0,
    maxRetries: 3,
    createdAt: new Date(),
    error: null,
    result: null,
    userId: "u1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests: enqueue
// ---------------------------------------------------------------------------

describe("enqueue", () => {
  it("creates a job with userId and returns the job id", async () => {
    const { enqueue } = await loadQueue();
    const job = makeJob({ id: "job-42" });
    mockJobCreate.mockResolvedValue(job);

    const id = await enqueue("inbound_message", {
      source: "test",
      senderId: "s1",
      content: "hello",
      userId: "u1",
      storedConfig: {},
      definitionName: "d1",
    }, "u1");

    expect(id).toBe("job-42");
    expect(mockJobCreate).toHaveBeenCalledWith({
      data: {
        type: "inbound_message",
        payload: expect.any(String),
        userId: "u1",
      },
    });
    expect(mockInfo).toHaveBeenCalledWith("Enqueuing job", { type: "inbound_message", userId: "u1" });
    expect(mockInfo).toHaveBeenCalledWith("Job enqueued", { jobId: "job-42", type: "inbound_message", userId: "u1" });
  });

  it("creates a job without userId (defaults to null)", async () => {
    const { enqueue } = await loadQueue();
    const job = makeJob({ id: "job-99" });
    mockJobCreate.mockResolvedValue(job);

    const id = await enqueue("compact_conversation", {
      conversationId: "conv-1",
      userId: "u2",
    });

    expect(id).toBe("job-99");
    expect(mockJobCreate).toHaveBeenCalledWith({
      data: {
        type: "compact_conversation",
        payload: expect.any(String),
        userId: null,
      },
    });
    expect(mockInfo).toHaveBeenCalledWith("Enqueuing job", { type: "compact_conversation", userId: null });
  });

  it("calls tickPoller after enqueuing (no-op when no handler)", async () => {
    const { enqueue } = await loadQueue();
    mockJobCreate.mockResolvedValue(makeJob());

    await enqueue("inbound_message", {
      source: "test",
      senderId: "s1",
      content: "hello",
      userId: "u1",
      storedConfig: {},
      definitionName: "d1",
    });

    // tickPoller is called but since no handler is registered, it returns early.
    // Verify the debug log from tickPoller.
    expect(mockDebug).toHaveBeenCalledWith("Poller tick requested");
  });
});

// ---------------------------------------------------------------------------
// Tests: dequeue
// ---------------------------------------------------------------------------

describe("dequeue", () => {
  it("returns the claimed job when a pending job exists", async () => {
    const { dequeue } = await loadQueue();
    const pendingJob = makeJob({ status: "pending", attempts: 0 });
    const updatedJob = makeJob({ status: "processing", attempts: 1 });

    // Mock $transaction to call the callback with a tx that has job methods
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(pendingJob),
          update: vi.fn().mockResolvedValue(updatedJob),
        },
      };
      return cb(tx);
    });

    const result = await dequeue();

    expect(result).toEqual(updatedJob);
    expect(mockDebug).toHaveBeenCalledWith("Attempting to dequeue next pending job");
    expect(mockInfo).toHaveBeenCalledWith("Job claimed for processing", {
      jobId: updatedJob.id,
      type: updatedJob.type,
      attempt: updatedJob.attempts,
    });
  });

  it("returns null when the queue is empty", async () => {
    const { dequeue } = await loadQueue();

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    const result = await dequeue();

    expect(result).toBeNull();
    expect(mockDebug).toHaveBeenCalledWith("Queue is empty, no pending jobs");
  });
});

// ---------------------------------------------------------------------------
// Tests: complete
// ---------------------------------------------------------------------------

describe("complete", () => {
  it("marks a job as completed with a result", async () => {
    const { complete } = await loadQueue();
    mockJobUpdate.mockResolvedValue({});

    await complete("job-1", { success: true });

    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { status: "completed", result: JSON.stringify({ success: true }) },
    });
    expect(mockInfo).toHaveBeenCalledWith("Job completed", { jobId: "job-1" });
  });

  it("marks a job as completed without a result (null)", async () => {
    const { complete } = await loadQueue();
    mockJobUpdate.mockResolvedValue({});

    await complete("job-2");

    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-2" },
      data: { status: "completed", result: null },
    });
    expect(mockInfo).toHaveBeenCalledWith("Job completed", { jobId: "job-2" });
  });
});

// ---------------------------------------------------------------------------
// Tests: fail
// ---------------------------------------------------------------------------

describe("fail", () => {
  it("returns early when the job is not found", async () => {
    const { fail } = await loadQueue();
    mockJobFindUnique.mockResolvedValue(null);

    await fail("nonexistent", "some error");

    expect(mockJobFindUnique).toHaveBeenCalledWith({ where: { id: "nonexistent" } });
    expect(mockJobUpdate).not.toHaveBeenCalled();
  });

  it("sets status back to pending when retries remain", async () => {
    const { fail } = await loadQueue();
    const job = makeJob({ id: "job-retry", attempts: 1, maxRetries: 3 });
    mockJobFindUnique.mockResolvedValue(job);
    mockJobUpdate.mockResolvedValue({});

    await fail("job-retry", "temporary error");

    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-retry" },
      data: { status: "pending", error: "temporary error" },
    });
    expect(mockWarn).toHaveBeenCalledWith("Job failed, will retry", {
      jobId: "job-retry",
      type: job.type,
      attempt: 1,
      maxRetries: 3,
      error: "temporary error",
    });
  });

  it("sets status to failed when max retries exhausted", async () => {
    const { fail } = await loadQueue();
    const job = makeJob({ id: "job-dead", attempts: 3, maxRetries: 3 });
    mockJobFindUnique.mockResolvedValue(job);
    mockJobUpdate.mockResolvedValue({});

    await fail("job-dead", "fatal error");

    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-dead" },
      data: { status: "failed", error: "fatal error" },
    });
    expect(mockError).toHaveBeenCalledWith("Job permanently failed, max retries exhausted", {
      jobId: "job-dead",
      type: job.type,
      attempt: 3,
      maxRetries: 3,
      error: "fatal error",
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: registerHandler
// ---------------------------------------------------------------------------

describe("registerHandler", () => {
  it("registers the handler and logs", async () => {
    const { registerHandler } = await loadQueue();

    const fn = vi.fn();
    registerHandler(fn);

    expect(mockInfo).toHaveBeenCalledWith("Job handler registered");
  });
});

// ---------------------------------------------------------------------------
// Tests: tickPoller (via enqueue after registerHandler)
// ---------------------------------------------------------------------------

describe("tickPoller", () => {
  it("returns early when no handler is registered", async () => {
    const { enqueue } = await loadQueue();
    mockJobCreate.mockResolvedValue(makeJob());

    await enqueue("inbound_message", {
      source: "test",
      senderId: "s1",
      content: "hi",
      userId: "u1",
      storedConfig: {},
      definitionName: "d1",
    });

    // tickPoller was called but returned early because no handler.
    // No timer should have been set, so advancing time should not trigger poll.
    expect(mockDebug).toHaveBeenCalledWith("Poller tick requested");
  });

  it("returns early when already polling", async () => {
    // We test this indirectly: when poll() is running (polling=true),
    // tickPoller called from enqueue will return early.
    const { registerHandler, enqueue } = await loadQueue();

    const handlerFn = vi.fn(async () => {
      // While inside the handler (polling=true), enqueue a second job.
      // The tickPoller call from the second enqueue should return early due to polling.
      mockJobCreate.mockResolvedValue(makeJob({ id: "job-inner" }));
      await enqueue("inbound_message", {
        source: "test",
        senderId: "s2",
        content: "during poll",
        userId: "u1",
        storedConfig: {},
        definitionName: "d1",
      });
      return { ok: true };
    });
    registerHandler(handlerFn);

    const pendingJob = makeJob({ id: "job-outer", status: "pending", attempts: 0 });
    const processingJob = makeJob({ id: "job-outer", status: "processing", attempts: 1 });

    mockTransaction.mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(pendingJob),
          update: vi.fn().mockResolvedValue(processingJob),
        },
      };
      return cb(tx);
    });
    // Subsequent dequeue calls return null to stop the loop
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    mockJobUpdate.mockResolvedValue({});
    mockJobCreate.mockResolvedValue(makeJob({ id: "job-outer" }));

    // First enqueue triggers tickPoller -> schedules poll at timeout 0
    await enqueue("inbound_message", {
      source: "test",
      senderId: "s1",
      content: "hi",
      userId: "u1",
      storedConfig: {},
      definitionName: "d1",
    });

    // Advance to run the poll
    await vi.advanceTimersByTimeAsync(0);

    // The handler was called, proving poll ran. The inner enqueue's
    // tickPoller should have returned early because polling was true.
    expect(handlerFn).toHaveBeenCalledOnce();
  });

  it("clears an existing timer and sets a new one", async () => {
    const { registerHandler, startPoller, enqueue } = await loadQueue();
    const handlerFn = vi.fn();
    registerHandler(handlerFn);

    // startPoller sets a timer via schedulePoll
    startPoller();

    // Now enqueue, which calls tickPoller which should clear the existing
    // timer and set a new one at setTimeout(poll, 0) instead of POLL_INTERVAL_MS
    mockJobCreate.mockResolvedValue(makeJob());
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    await enqueue("inbound_message", {
      source: "test",
      senderId: "s1",
      content: "hi",
      userId: "u1",
      storedConfig: {},
      definitionName: "d1",
    });

    // The tickPoller should have cleared the 2000ms timer and scheduled at 0ms.
    // Advancing by 0ms should trigger poll.
    await vi.advanceTimersByTimeAsync(0);

    // dequeue was called (from poll), meaning the immediate timer fired.
    expect(mockDebug).toHaveBeenCalledWith("Attempting to dequeue next pending job");
  });
});

// ---------------------------------------------------------------------------
// Tests: startPoller
// ---------------------------------------------------------------------------

describe("startPoller", () => {
  it("warns and returns when no handler is registered", async () => {
    const { startPoller } = await loadQueue();

    startPoller();

    expect(mockWarn).toHaveBeenCalledWith("No handler registered \u2014 call registerHandler() first");
  });

  it("starts polling when a handler is registered", async () => {
    const { registerHandler, startPoller } = await loadQueue();
    const handlerFn = vi.fn();
    registerHandler(handlerFn);

    // Set up dequeue to return null (empty queue)
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    startPoller();

    expect(mockInfo).toHaveBeenCalledWith("Starting background poller", { intervalMs: 2000 });

    // Advance past poll interval to confirm poll runs
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockDebug).toHaveBeenCalledWith("Attempting to dequeue next pending job");
  });
});

// ---------------------------------------------------------------------------
// Tests: poll (indirectly via startPoller / tickPoller)
// ---------------------------------------------------------------------------

describe("poll", () => {
  it("when poll is called while already polling, it schedules next poll and returns early", async () => {
    // We need to hit lines 177-179: if (polling || !handler) { schedulePoll(); return; }
    // Strategy: Use a handler that returns a pending promise. While the handler
    // is executing (polling=true), we capture the poll fn from setTimeout and
    // call it directly, simulating a re-entrant call.
    vi.useRealTimers();

    // Capture all setTimeout callbacks
    const timeoutCalls: Array<{ fn: Function; delay: number }> = [];
    const origSetTimeout = globalThis.setTimeout;
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((fn: Function, delay?: number) => {
        timeoutCalls.push({ fn, delay: delay ?? 0 });
        // Return a fake timer id
        return 999 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
    );
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => {});

    const { registerHandler, startPoller } = await loadQueue();

    let resolveHandler!: (value: unknown) => void;
    const handlerFn = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => { resolveHandler = resolve; });
    });
    registerHandler(handlerFn);

    const pendingJob = makeJob({ id: "job-slow", status: "pending", attempts: 0 });
    const processingJob = makeJob({ id: "job-slow", status: "processing", attempts: 1 });

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(pendingJob),
          update: vi.fn().mockResolvedValue(processingJob),
        },
      };
      return cb(tx);
    });

    mockJobUpdate.mockResolvedValue({});

    // Start the poller — schedulePoll called, setTimeout(poll, 2000)
    startPoller();

    expect(timeoutCalls.length).toBe(1);
    const pollFn = timeoutCalls[0].fn;

    // Call poll for the first time — it starts processing (polling=true, handler blocks)
    const pollPromise = pollFn();

    // Give the microtasks a chance to run so poll enters the handler
    await new Promise((r) => origSetTimeout(r, 10));

    // Now polling=true. Call poll again — should hit the guard and return
    const beforeLen = timeoutCalls.length;
    await pollFn();
    // The re-entrant call should have called schedulePoll which adds another setTimeout
    expect(timeoutCalls.length).toBeGreaterThan(beforeLen);

    // Resolve the handler and let the original poll finish
    resolveHandler({ ok: true });
    await pollPromise;

    // Restore
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
    // Re-enable fake timers for other tests
    vi.useFakeTimers();
  });

  it("stops polling and schedules next poll when dequeue returns null", async () => {
    const { registerHandler, startPoller } = await loadQueue();
    const handlerFn = vi.fn();
    registerHandler(handlerFn);

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    startPoller();
    await vi.advanceTimersByTimeAsync(2000);

    // dequeue returned null, handler should NOT be called
    expect(handlerFn).not.toHaveBeenCalled();
    expect(mockDebug).toHaveBeenCalledWith("Queue is empty, no pending jobs");

    // After returning null, it should schedule another poll.
    // Advance again to prove another poll fires.
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it("processes a job successfully", async () => {
    const { registerHandler, startPoller } = await loadQueue();
    const handlerFn = vi.fn().mockResolvedValue({ processed: true });
    registerHandler(handlerFn);

    const pendingJob = makeJob({ id: "job-ok", status: "pending", attempts: 0 });
    const processingJob = makeJob({ id: "job-ok", status: "processing", attempts: 1 });

    // First dequeue returns a job, subsequent ones return null
    let callCount = 0;
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      callCount++;
      if (callCount === 1) {
        const tx = {
          job: {
            findFirst: vi.fn().mockResolvedValue(pendingJob),
            update: vi.fn().mockResolvedValue(processingJob),
          },
        };
        return cb(tx);
      }
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    mockJobUpdate.mockResolvedValue({});

    startPoller();
    await vi.advanceTimersByTimeAsync(2000);

    expect(handlerFn).toHaveBeenCalledOnce();
    expect(handlerFn).toHaveBeenCalledWith(
      processingJob.type,
      JSON.parse(processingJob.payload),
    );
    expect(mockInfo).toHaveBeenCalledWith("Processing job", { jobId: "job-ok", type: processingJob.type });
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-ok" },
      data: { status: "completed", result: JSON.stringify({ processed: true }) },
    });
    expect(mockInfo).toHaveBeenCalledWith("Job processed successfully", expect.objectContaining({
      jobId: "job-ok",
      type: processingJob.type,
    }));
  });

  it("calls fail when the handler throws an Error", async () => {
    const { registerHandler, startPoller } = await loadQueue();
    const handlerFn = vi.fn().mockRejectedValue(new Error("handler blew up"));
    registerHandler(handlerFn);

    const pendingJob = makeJob({ id: "job-err", status: "pending", attempts: 0 });
    const processingJob = makeJob({ id: "job-err", status: "processing", attempts: 1, maxRetries: 3 });

    let callCount = 0;
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      callCount++;
      if (callCount === 1) {
        const tx = {
          job: {
            findFirst: vi.fn().mockResolvedValue(pendingJob),
            update: vi.fn().mockResolvedValue(processingJob),
          },
        };
        return cb(tx);
      }
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    // fail() calls findUnique then update
    mockJobFindUnique.mockResolvedValue(processingJob);
    mockJobUpdate.mockResolvedValue({});

    startPoller();
    await vi.advanceTimersByTimeAsync(2000);

    expect(handlerFn).toHaveBeenCalledOnce();
    expect(mockError).toHaveBeenCalledWith("Job processing failed", expect.objectContaining({
      jobId: "job-err",
      type: processingJob.type,
      error: "handler blew up",
    }));
    // fail() should have been called, which sets status back to pending (retries remain)
    expect(mockJobFindUnique).toHaveBeenCalledWith({ where: { id: "job-err" } });
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-err" },
      data: { status: "pending", error: "handler blew up" },
    });
  });

  it("calls fail with String(err) when the handler throws a non-Error", async () => {
    const { registerHandler, startPoller } = await loadQueue();
    const handlerFn = vi.fn().mockRejectedValue("string error");
    registerHandler(handlerFn);

    const pendingJob = makeJob({ id: "job-str-err", status: "pending", attempts: 0 });
    const processingJob = makeJob({ id: "job-str-err", status: "processing", attempts: 1, maxRetries: 3 });

    let callCount = 0;
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      callCount++;
      if (callCount === 1) {
        const tx = {
          job: {
            findFirst: vi.fn().mockResolvedValue(pendingJob),
            update: vi.fn().mockResolvedValue(processingJob),
          },
        };
        return cb(tx);
      }
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    mockJobFindUnique.mockResolvedValue(processingJob);
    mockJobUpdate.mockResolvedValue({});

    startPoller();
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockError).toHaveBeenCalledWith("Job processing failed", expect.objectContaining({
      error: "string error",
    }));
  });

  it("catches dequeue errors and schedules next poll (poller error with Error)", async () => {
    const { registerHandler, startPoller } = await loadQueue();
    const handlerFn = vi.fn();
    registerHandler(handlerFn);

    // Make $transaction throw
    mockTransaction.mockRejectedValueOnce(new Error("DB is down"));

    // Next call succeeds with empty queue
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    startPoller();
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockError).toHaveBeenCalledWith("Poller error", { error: "DB is down" });

    // It should have scheduled another poll after the error
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockDebug).toHaveBeenCalledWith("Queue is empty, no pending jobs");
  });

  it("catches dequeue errors with non-Error thrown (poller error with string)", async () => {
    const { registerHandler, startPoller } = await loadQueue();
    const handlerFn = vi.fn();
    registerHandler(handlerFn);

    // Make $transaction throw a non-Error
    mockTransaction.mockRejectedValueOnce("some string crash");

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    startPoller();
    await vi.advanceTimersByTimeAsync(2000);

    expect(mockError).toHaveBeenCalledWith("Poller error", { error: "some string crash" });
  });

  it("after successful job processing, tickPoller is called and checks for more work", async () => {
    const { registerHandler, startPoller } = await loadQueue();
    const handlerFn = vi.fn().mockResolvedValue(undefined);
    registerHandler(handlerFn);

    const pendingJob1 = makeJob({ id: "job-a", status: "pending", attempts: 0 });
    const processingJob1 = makeJob({ id: "job-a", status: "processing", attempts: 1 });
    const pendingJob2 = makeJob({ id: "job-b", status: "pending", attempts: 0 });
    const processingJob2 = makeJob({ id: "job-b", status: "processing", attempts: 1 });

    let callCount = 0;
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      callCount++;
      if (callCount === 1) {
        const tx = {
          job: {
            findFirst: vi.fn().mockResolvedValue(pendingJob1),
            update: vi.fn().mockResolvedValue(processingJob1),
          },
        };
        return cb(tx);
      }
      if (callCount === 2) {
        const tx = {
          job: {
            findFirst: vi.fn().mockResolvedValue(pendingJob2),
            update: vi.fn().mockResolvedValue(processingJob2),
          },
        };
        return cb(tx);
      }
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    mockJobUpdate.mockResolvedValue({});

    startPoller();
    // First poll fires at 2000ms, processes job-a.
    await vi.advanceTimersByTimeAsync(2000);
    // After the first poll processes job-a, tickPoller sets setTimeout(poll, 0).
    // Advance to fire the immediate timer for the second poll.
    await vi.advanceTimersByTimeAsync(1);
    // Third poll (dequeue returns null) scheduled at 0ms from tickPoller after job-b.
    await vi.advanceTimersByTimeAsync(1);

    // Both jobs should be processed
    expect(handlerFn).toHaveBeenCalledTimes(2);
    expect(handlerFn).toHaveBeenCalledWith(processingJob1.type, JSON.parse(processingJob1.payload));
    expect(handlerFn).toHaveBeenCalledWith(processingJob2.type, JSON.parse(processingJob2.payload));
  });
});

// ---------------------------------------------------------------------------
// Tests: schedulePoll — clearing existing timer
// ---------------------------------------------------------------------------

describe("schedulePoll (via startPoller called twice)", () => {
  it("clears existing timer when schedulePoll is called again", async () => {
    const { registerHandler, startPoller } = await loadQueue();
    const handlerFn = vi.fn();
    registerHandler(handlerFn);

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        job: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return cb(tx);
    });

    // Start poller twice — second call to schedulePoll clears first timer
    startPoller();
    startPoller();

    await vi.advanceTimersByTimeAsync(2000);

    // Poll should have run exactly once (second timer replaced first)
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: complete with falsy result
// ---------------------------------------------------------------------------

describe("complete edge cases", () => {
  it("stores null when result is undefined", async () => {
    const { complete } = await loadQueue();
    mockJobUpdate.mockResolvedValue({});

    await complete("job-x", undefined);

    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-x" },
      data: { status: "completed", result: null },
    });
  });

  it("stores null when result is 0 (falsy)", async () => {
    const { complete } = await loadQueue();
    mockJobUpdate.mockResolvedValue({});

    await complete("job-y", 0);

    // 0 is falsy, so `result ? ... : null` yields null
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-y" },
      data: { status: "completed", result: null },
    });
  });

  it("stores null when result is an empty string (falsy)", async () => {
    const { complete } = await loadQueue();
    mockJobUpdate.mockResolvedValue({});

    await complete("job-z", "");

    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-z" },
      data: { status: "completed", result: null },
    });
  });
});
