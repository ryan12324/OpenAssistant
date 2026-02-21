import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLog, MockPrismaClient, MockAdapter } = vi.hoisted(() => {
  const mockLog = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  class MockPrismaClient {
    constructor(_opts?: unknown) {}
  }
  class MockAdapter {
    constructor(_opts?: unknown) {}
  }
  return { mockLog, MockPrismaClient, MockAdapter };
});

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => mockLog),
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: MockPrismaClient,
}));

vi.mock("@prisma/adapter-better-sqlite3", () => ({
  PrismaBetterSqlite3: MockAdapter,
}));

describe("prisma", () => {
  const g = globalThis as unknown as { prisma: unknown };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete g.prisma;
  });

  it("creates a new PrismaClient, logs creation, and caches on globalThis", async () => {
    process.env.NODE_ENV = "test";

    const mod = await import("@/lib/prisma");

    expect(mod.prisma).toBeInstanceOf(MockPrismaClient);
    expect(mockLog.info).toHaveBeenCalledWith("PrismaClient created", {
      env: "test",
    });
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

  it("caches on globalThis in production (singleton consistency)", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const mod = await import("@/lib/prisma");

    expect(mod.prisma).toBeInstanceOf(MockPrismaClient);
    expect(mockLog.info).toHaveBeenCalledWith("PrismaClient created", {
      env: "production",
    });
    // globalThis.prisma should be set in ALL environments now
    expect(g.prisma).toBe(mod.prisma);

    process.env.NODE_ENV = originalEnv;
  });
});
