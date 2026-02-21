import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockPrisma, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockPrisma: {
    conversation: { findFirst: vi.fn() },
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

import { GET } from "../route";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/conversations/[id]", () => {
  it("returns a conversation with messages", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const conversation = {
      id: "conv-1",
      title: "Test",
      messages: [{ id: "msg-1", role: "user", content: "hi" }],
    };
    mockPrisma.conversation.findFirst.mockResolvedValue(conversation);

    const req = new Request("http://localhost/api/conversations/conv-1");
    const res = await GET(req as any, makeParams("conv-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(conversation);
    expect(mockPrisma.conversation.findFirst).toHaveBeenCalledWith({
      where: { id: "conv-1", userId: "user-1" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  });

  it("returns 404 when conversation is not found", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost/api/conversations/conv-missing");
    const res = await GET(req as any, makeParams("conv-missing"));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Not found" });
  });

  it("returns 401 when requireSession throws Unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = new Request("http://localhost/api/conversations/conv-1");
    const res = await GET(req as any, makeParams("conv-1"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when a generic error occurs", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const req = new Request("http://localhost/api/conversations/conv-1");
    const res = await GET(req as any, makeParams("conv-1"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 when non-Error is thrown", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.findFirst.mockRejectedValue("string error");

    const req = new Request("http://localhost/api/conversations/conv-1");
    const res = await GET(req as any, makeParams("conv-1"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});
