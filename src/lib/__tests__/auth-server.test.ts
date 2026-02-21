import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetSession, mockHeaders, mockLog } = vi.hoisted(() => {
  const mockLog = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  return {
    mockGetSession: vi.fn(),
    mockHeaders: vi.fn(),
    mockLog,
  };
});

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => mockLog),
}));

import { getSession, requireSession } from "@/lib/auth-server";

describe("auth-server", () => {
  const fakeHeaders = new Headers({ authorization: "Bearer token" });

  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(fakeHeaders);
  });

  describe("getSession", () => {
    it("returns the session and logs userId when a session exists", async () => {
      const fakeSession = { user: { id: "user-123" } };
      mockGetSession.mockResolvedValue(fakeSession);

      const result = await getSession();

      expect(result).toBe(fakeSession);
      expect(mockHeaders).toHaveBeenCalled();
      expect(mockGetSession).toHaveBeenCalledWith({ headers: fakeHeaders });
      expect(mockLog.debug).toHaveBeenCalledWith(
        "Resolving session from request headers"
      );
      expect(mockLog.debug).toHaveBeenCalledWith("Session resolved", {
        userId: "user-123",
      });
    });

    it("returns null and logs 'No active session found' when session is null", async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await getSession();

      expect(result).toBeNull();
      expect(mockLog.debug).toHaveBeenCalledWith(
        "Resolving session from request headers"
      );
      expect(mockLog.debug).toHaveBeenCalledWith("No active session found");
    });
  });

  describe("requireSession", () => {
    it("returns the session when authenticated", async () => {
      const fakeSession = { user: { id: "user-456" } };
      mockGetSession.mockResolvedValue(fakeSession);

      const result = await requireSession();

      expect(result).toBe(fakeSession);
      expect(mockLog.debug).toHaveBeenCalledWith(
        "requireSession \u2014 authorized",
        { userId: "user-456" }
      );
    });

    it("throws Error('Unauthorized') when no session exists", async () => {
      mockGetSession.mockResolvedValue(null);

      await expect(requireSession()).rejects.toThrow("Unauthorized");
      expect(mockLog.warn).toHaveBeenCalledWith(
        "requireSession \u2014 unauthorized request rejected"
      );
    });
  });
});
