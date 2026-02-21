import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockMemoryManager, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockMemoryManager: { list: vi.fn(), store: vi.fn(), delete: vi.fn() },
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/rag/memory", () => ({
  memoryManager: mockMemoryManager,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
});

// ========================== GET ===========================================

describe("GET /api/memory", () => {
  it("returns memories with default params", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const result = { memories: [{ id: "mem-1" }], total: 1 };
    mockMemoryManager.list.mockResolvedValue(result);

    const req = new NextRequest("http://localhost/api/memory");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(result);
    expect(mockMemoryManager.list).toHaveBeenCalledWith({
      userId: "user-1",
      type: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it("passes query params correctly", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.list.mockResolvedValue({ memories: [], total: 0 });

    const req = new NextRequest("http://localhost/api/memory?type=long_term&limit=10&offset=5");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockMemoryManager.list).toHaveBeenCalledWith({
      userId: "user-1",
      type: "long_term",
      limit: 10,
      offset: 5,
    });
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = new NextRequest("http://localhost/api/memory");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB error"));

    const req = new NextRequest("http://localhost/api/memory");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 on non-Error throw", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.list.mockRejectedValue("list error");

    const req = new NextRequest("http://localhost/api/memory");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});

// ========================== POST ==========================================

describe("POST /api/memory", () => {
  function makeRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("stores a memory with default type", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.store.mockResolvedValue("mem-new");

    const req = makeRequest({ content: "Remember this" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ id: "mem-new", status: "ok" });
    expect(mockMemoryManager.store).toHaveBeenCalledWith({
      userId: "user-1",
      content: "Remember this",
      type: "long_term",
      tags: undefined,
      summary: undefined,
    });
  });

  it("stores a memory with specified type and tags", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.store.mockResolvedValue("mem-2");

    const req = makeRequest({
      content: "Important",
      type: "episodic",
      tags: ["test"],
      summary: "Test summary",
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ id: "mem-2", status: "ok" });
    expect(mockMemoryManager.store).toHaveBeenCalledWith({
      userId: "user-1",
      content: "Important",
      type: "episodic",
      tags: ["test"],
      summary: "Test summary",
    });
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makeRequest({ content: "test" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB error"));

    const req = makeRequest({ content: "test" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 on non-Error throw", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.store.mockRejectedValue("store error");

    const req = makeRequest({ content: "test" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});

// ========================== DELETE ========================================

describe("DELETE /api/memory", () => {
  function makeRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost/api/memory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("deletes a memory successfully", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.delete.mockResolvedValue(undefined);

    const req = makeRequest({ memoryId: "mem-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ status: "ok" });
    expect(mockMemoryManager.delete).toHaveBeenCalledWith("mem-1", "user-1");
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makeRequest({ memoryId: "mem-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB error"));

    const req = makeRequest({ memoryId: "mem-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 on non-Error throw", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.delete.mockRejectedValue("delete error");

    const req = makeRequest({ memoryId: "mem-1" });
    const res = await DELETE(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});
