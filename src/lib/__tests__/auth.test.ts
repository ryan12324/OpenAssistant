import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockBetterAuth, mockPrismaAdapter, mockPrisma } = vi.hoisted(() => ({
  mockBetterAuth: vi.fn(),
  mockPrismaAdapter: vi.fn(),
  mockPrisma: { __mock: true },
}));

vi.mock("better-auth", () => ({
  betterAuth: mockBetterAuth,
}));

vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter: mockPrismaAdapter,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

describe("auth", () => {
  const mockAdapter = { __adapter: true };
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    vi.clearAllMocks();
    vi.resetModules();

    mockPrismaAdapter.mockReturnValue(mockAdapter);
    mockBetterAuth.mockReturnValue({
      $Infer: { Session: {} },
      api: {},
    });

    // Clear social provider env vars
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("has empty socialProviders when no GitHub/Google env vars are set", async () => {
    await import("@/lib/auth");

    expect(mockPrismaAdapter).toHaveBeenCalledWith(mockPrisma, {
      provider: "sqlite",
    });
    expect(mockBetterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        database: mockAdapter,
        emailAndPassword: { enabled: true },
        socialProviders: {},
        session: {
          expiresIn: 60 * 60 * 24 * 7,
          updateAge: 60 * 60 * 24,
        },
      })
    );
  });

  it("includes github in socialProviders when GitHub env vars are set", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-client-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-client-secret";

    await import("@/lib/auth");

    const config = mockBetterAuth.mock.calls[0][0];
    expect(config.socialProviders).toEqual({
      github: {
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      },
    });
  });

  it("includes google in socialProviders when Google env vars are set", async () => {
    process.env.GOOGLE_CLIENT_ID = "goog-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "goog-client-secret";

    await import("@/lib/auth");

    const config = mockBetterAuth.mock.calls[0][0];
    expect(config.socialProviders).toEqual({
      google: {
        clientId: "goog-client-id",
        clientSecret: "goog-client-secret",
      },
    });
  });

  it("includes both github and google in socialProviders when all env vars are set", async () => {
    process.env.GITHUB_CLIENT_ID = "gh-client-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-client-secret";
    process.env.GOOGLE_CLIENT_ID = "goog-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "goog-client-secret";

    await import("@/lib/auth");

    const config = mockBetterAuth.mock.calls[0][0];
    expect(config.socialProviders).toEqual({
      github: {
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      },
      google: {
        clientId: "goog-client-id",
        clientSecret: "goog-client-secret",
      },
    });
  });

  it("calls betterAuth with correct emailAndPassword and session config", async () => {
    await import("@/lib/auth");

    const config = mockBetterAuth.mock.calls[0][0];
    expect(config.emailAndPassword).toEqual({ enabled: true });
    expect(config.session).toEqual({
      expiresIn: 604800,
      updateAge: 86400,
    });
  });

  it("exports the auth object returned by betterAuth", async () => {
    const mockAuthObj = {
      $Infer: { Session: {} },
      api: { getSession: vi.fn() },
    };
    mockBetterAuth.mockReturnValue(mockAuthObj);

    const mod = await import("@/lib/auth");

    expect(mod.auth).toBe(mockAuthObj);
  });
});
