import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockPrisma, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockPrisma: {
    conversation: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { GET, DELETE } from "../route";

function makeDeleteRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/conversations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ========================== GET ===========================================

describe("GET /api/conversations", () => {
  it("returns list of conversations for the current user", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const conversations = [
      { id: "conv-1", title: "Hello", messages: [], channelLinks: [] },
      { id: "conv-2", title: "World", messages: [], channelLinks: [] },
    ];
    mockPrisma.conversation.findMany.mockResolvedValue(conversations);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(conversations);
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { id: true, role: true, content: true, source: true, createdAt: true },
        },
        channelLinks: {
          select: { platform: true, externalId: true },
        },
      },
    });
  });

  it("returns empty array when user has no conversations", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.findMany.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });

  it("returns 401 when requireSession throws Unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when a generic error occurs", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 when non-Error is thrown", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.findMany.mockRejectedValue("some string error");

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});

// ========================== DELETE ========================================

describe("DELETE /api/conversations", () => {
  it("deletes a conversation by id", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.deleteMany.mockResolvedValue({ count: 1 });

    const req = makeDeleteRequest({ conversationId: "conv-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ status: "ok" });
    expect(mockPrisma.conversation.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "conv-1",
        userId: "user-1",
      },
    });
  });

  it("returns 401 when requireSession throws Unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makeDeleteRequest({ conversationId: "conv-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when a generic error occurs", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const req = makeDeleteRequest({ conversationId: "conv-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 when non-Error is thrown", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.deleteMany.mockRejectedValue("delete error");

    const req = makeDeleteRequest({ conversationId: "conv-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});
