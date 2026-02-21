import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetLogger, mockStartWorker, mockLog } = vi.hoisted(() => ({
  mockGetLogger: vi.fn(),
  mockStartWorker: vi.fn(),
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockGetLogger.mockReturnValue(mockLog);
});

describe("register()", () => {
  it("calls initWorker which imports logger and worker when NEXT_RUNTIME is 'nodejs'", async () => {
    process.env.NEXT_RUNTIME = "nodejs";

    vi.doMock("@/lib/logger", () => ({
      getLogger: mockGetLogger,
    }));
    vi.doMock("@/lib/worker", () => ({
      initWorker: mockStartWorker,
    }));

    const { register } = await import("@/instrumentation");
    register();

    // Wait for the internal initWorker() promise to settle
    await vi.waitFor(() => {
      expect(mockGetLogger).toHaveBeenCalledWith("instrumentation");
    });

    expect(mockLog.info).toHaveBeenCalledWith(
      "Server starting — initializing background worker",
      { runtime: "nodejs" }
    );
    expect(mockStartWorker).toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith("Instrumentation complete — worker initialized");

    delete process.env.NEXT_RUNTIME;
  });

  it("does nothing when NEXT_RUNTIME is not set", async () => {
    delete process.env.NEXT_RUNTIME;

    vi.doMock("@/lib/logger", () => ({
      getLogger: mockGetLogger,
    }));
    vi.doMock("@/lib/worker", () => ({
      initWorker: mockStartWorker,
    }));

    const { register } = await import("@/instrumentation");
    register();

    // Give time for any async work to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(mockGetLogger).not.toHaveBeenCalled();
    expect(mockStartWorker).not.toHaveBeenCalled();
  });

  it("does nothing when NEXT_RUNTIME is 'edge'", async () => {
    process.env.NEXT_RUNTIME = "edge";

    vi.doMock("@/lib/logger", () => ({
      getLogger: mockGetLogger,
    }));
    vi.doMock("@/lib/worker", () => ({
      initWorker: mockStartWorker,
    }));

    const { register } = await import("@/instrumentation");
    register();

    // Give time for any async work to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(mockGetLogger).not.toHaveBeenCalled();
    expect(mockStartWorker).not.toHaveBeenCalled();

    delete process.env.NEXT_RUNTIME;
  });

  it("logs error to console.error when initWorker fails", async () => {
    process.env.NEXT_RUNTIME = "nodejs";

    const initError = new Error("Worker init failed");

    vi.doMock("@/lib/logger", () => ({
      getLogger: mockGetLogger,
    }));
    vi.doMock("@/lib/worker", () => ({
      initWorker: () => {
        throw initError;
      },
    }));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { register } = await import("@/instrumentation");
    register();

    // Wait for the catch handler to fire
    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to initialize worker:",
        initError
      );
    });

    consoleErrorSpy.mockRestore();
    delete process.env.NEXT_RUNTIME;
  });
});
