import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetLogger, mockInitWorker, mockLog } = vi.hoisted(() => ({
  mockGetLogger: vi.fn(),
  mockInitWorker: vi.fn(),
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockGetLogger.mockReturnValue(mockLog);
});

describe("register()", () => {
  it("imports logger and worker and calls initWorker when NEXT_RUNTIME is 'nodejs'", async () => {
    process.env.NEXT_RUNTIME = "nodejs";

    vi.doMock("@/lib/logger", () => ({
      getLogger: mockGetLogger,
    }));
    vi.doMock("@/lib/worker", () => ({
      initWorker: mockInitWorker,
    }));

    const { register } = await import("@/instrumentation");
    await register();

    expect(mockGetLogger).toHaveBeenCalledWith("instrumentation");
    expect(mockLog.info).toHaveBeenCalledWith(
      "Server starting — initializing background worker",
      { runtime: "nodejs" }
    );
    expect(mockInitWorker).toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith("Instrumentation complete — worker initialized");

    delete process.env.NEXT_RUNTIME;
  });

  it("does nothing when NEXT_RUNTIME is not set", async () => {
    delete process.env.NEXT_RUNTIME;

    vi.doMock("@/lib/logger", () => ({
      getLogger: mockGetLogger,
    }));
    vi.doMock("@/lib/worker", () => ({
      initWorker: mockInitWorker,
    }));

    const { register } = await import("@/instrumentation");
    await register();

    expect(mockGetLogger).not.toHaveBeenCalled();
    expect(mockInitWorker).not.toHaveBeenCalled();
  });

  it("does nothing when NEXT_RUNTIME is 'edge'", async () => {
    process.env.NEXT_RUNTIME = "edge";

    vi.doMock("@/lib/logger", () => ({
      getLogger: mockGetLogger,
    }));
    vi.doMock("@/lib/worker", () => ({
      initWorker: mockInitWorker,
    }));

    const { register } = await import("@/instrumentation");
    await register();

    expect(mockGetLogger).not.toHaveBeenCalled();
    expect(mockInitWorker).not.toHaveBeenCalled();

    delete process.env.NEXT_RUNTIME;
  });
});
