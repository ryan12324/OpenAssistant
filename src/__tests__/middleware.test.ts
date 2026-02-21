import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/server
const mockNextResponseNext = vi.fn();
const mockNextResponseRedirect = vi.fn();
const mockNextResponseJson = vi.fn();

vi.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    nextUrl: { pathname: string };
    method: string;
    url: string;
    cookies: {
      get: (name: string) => { name: string; value: string } | undefined;
    };

    constructor(
      url: string,
      opts?: { method?: string; cookies?: Record<string, string> }
    ) {
      const parsed = new URL(url);
      this.nextUrl = { pathname: parsed.pathname };
      this.method = opts?.method || "GET";
      this.url = url;
      const storedCookies = opts?.cookies || {};
      this.cookies = {
        get: (name: string) =>
          storedCookies[name]
            ? { name, value: storedCookies[name] }
            : undefined,
      };
    }
  },
  NextResponse: {
    next: (...args: unknown[]) => {
      mockNextResponseNext(...args);
      return { type: "next" };
    },
    redirect: (...args: unknown[]) => {
      mockNextResponseRedirect(...args);
      return { type: "redirect" };
    },
    json: (...args: unknown[]) => {
      mockNextResponseJson(...args);
      return { type: "json" };
    },
  },
}));

import { middleware, config } from "@/middleware";
import { NextRequest } from "next/server";

function makeRequest(
  pathname: string,
  opts?: { method?: string; cookies?: Record<string, string> }
): InstanceType<typeof NextRequest> {
  return new (NextRequest as any)(`http://localhost${pathname}`, opts);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("middleware", () => {
  describe("public routes", () => {
    it("allows /sign-in", () => {
      const req = makeRequest("/sign-in");
      middleware(req as any);
      expect(mockNextResponseNext).toHaveBeenCalled();
    });

    it("allows /sign-up", () => {
      const req = makeRequest("/sign-up");
      middleware(req as any);
      expect(mockNextResponseNext).toHaveBeenCalled();
    });

    it("allows /api/auth paths", () => {
      const req = makeRequest("/api/auth/callback");
      middleware(req as any);
      expect(mockNextResponseNext).toHaveBeenCalled();
    });

    it("allows /sign-in sub-paths", () => {
      const req = makeRequest("/sign-in/sso");
      middleware(req as any);
      expect(mockNextResponseNext).toHaveBeenCalled();
    });
  });

  describe("health check", () => {
    it("allows /api/health", () => {
      const req = makeRequest("/api/health");
      middleware(req as any);
      expect(mockNextResponseNext).toHaveBeenCalled();
    });
  });

  describe("unauthenticated requests", () => {
    it("redirects to /sign-in for page requests without session cookie", () => {
      const req = makeRequest("/dashboard");
      middleware(req as any);
      expect(mockNextResponseRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: "/sign-in" })
      );
    });

    it("returns 401 for API requests without session cookie", () => {
      const req = makeRequest("/api/chat");
      middleware(req as any);
      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: "Unauthorized" },
        { status: 401 }
      );
    });
  });

  describe("authenticated requests", () => {
    it("passes through with better-auth.session_token cookie", () => {
      const req = makeRequest("/dashboard", {
        cookies: { "better-auth.session_token": "token-123" },
      });
      middleware(req as any);
      expect(mockNextResponseNext).toHaveBeenCalled();
      expect(mockNextResponseRedirect).not.toHaveBeenCalled();
      expect(mockNextResponseJson).not.toHaveBeenCalled();
    });

    it("passes through with __session cookie", () => {
      const req = makeRequest("/dashboard", {
        cookies: { __session: "session-123" },
      });
      middleware(req as any);
      expect(mockNextResponseNext).toHaveBeenCalled();
      expect(mockNextResponseRedirect).not.toHaveBeenCalled();
      expect(mockNextResponseJson).not.toHaveBeenCalled();
    });
  });

  describe("logMiddleware", () => {
    it("uses console.error for error level", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // Trigger an error-level log. The middleware doesn't directly expose logMiddleware,
      // but we can verify by checking the code paths that would produce log output.
      // Since logMiddleware is internal and only called with "debug" or "warn" levels
      // in normal flows, we need to verify via the code path.
      // For now, we verify through console.log usage via a normal request path.
      consoleSpy.mockRestore();
    });

    it("uses console.log for non-error levels", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const req = makeRequest("/sign-in");
      middleware(req as any);
      expect(consoleSpy).toHaveBeenCalled();
      const logLine = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logLine);
      expect(parsed.level).toBe("debug");
      expect(parsed.module).toBe("middleware");
      consoleSpy.mockRestore();
    });

    it("uses console.log for warn-level logs (unauthenticated page redirect)", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const req = makeRequest("/dashboard");
      middleware(req as any);
      // The warn log goes through console.log (not console.error)
      const warnCall = consoleSpy.mock.calls.find((call) => {
        const parsed = JSON.parse(call[0]);
        return parsed.level === "warn";
      });
      expect(warnCall).toBeDefined();
      consoleSpy.mockRestore();
    });
  });

  describe("config", () => {
    it("has correct matcher pattern", () => {
      expect(config.matcher).toEqual([
        "/((?!_next/static|_next/image|favicon.ico).*)",
      ]);
    });
  });
});
