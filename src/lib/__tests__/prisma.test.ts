import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLog, MockPrismaClient } = vi.hoisted(() => {
  const mockLog = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  class MockPrismaClient {}
  return { mockLog, MockPrismaClient };
});

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => mockLog),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: MockPrismaClient,
}));

describe("prisma", () => {
  const g = globalThis as unknown as { prisma: unknown };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete g.prisma;
  });

  it("creates a new PrismaClient, logs creation, and caches on globalThis in non-production", async () => {
    process.env.NODE_ENV = "test";

    const mod = await import("@/lib/prisma");

    expect(mod.prisma).toBeInstanceOf(MockPrismaClient);
    expect(mockLog.info).toHaveBeenCalledWith("PrismaClient created", {
      env: "test",
    });
    expect(mockLog.debug).toHaveBeenCalledWith(
      "PrismaClient cached on globalThis (dev mode)"
    );
    expect(g.prisma).toBe(mod.prisma);
  });

  it("reuses existing globalThis.prisma and does NOT log 'PrismaClient created'", async () => {
    process.env.NODE_ENV = "test";
    const existingClient = new MockPrismaClient();
    g.prisma = existingClient;

    const mod = await import("@/lib/prisma");

    expect(mod.prisma).toBe(existingClient);
    expect(mockLog.info).not.toHaveBeenCalledWith(
      "PrismaClient created",
      expect.anything()
    );
  });

  it("does NOT cache on globalThis in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const mod = await import("@/lib/prisma");

    expect(mod.prisma).toBeInstanceOf(MockPrismaClient);
    expect(mockLog.info).toHaveBeenCalledWith("PrismaClient created", {
      env: "production",
    });
    expect(mockLog.debug).not.toHaveBeenCalledWith(
      "PrismaClient cached on globalThis (dev mode)"
    );
    // globalThis.prisma should NOT have been set
    expect(g.prisma).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });
});
