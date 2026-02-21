import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – use vi.hoisted() so variables are available in vi.mock() factories
// ---------------------------------------------------------------------------
const { mockLogger, mockFetch } = vi.hoisted(() => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  const mockFetch = vi.fn();
  return { mockLogger, mockFetch };
});

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => mockLogger),
}));

vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { ragClient } from "../client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

function mockErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(body),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ragClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── ragFetch internals (tested through public methods) ──────────────

  describe("ragFetch (internal)", () => {
    it("sends GET request with correct headers when no API key", async () => {
      const responseBody = { status: "ok", lightrag: true, rag_anything: true };
      mockFetch.mockResolvedValue(mockOkResponse(responseBody));

      await ragClient.health();

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/health");
      expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("throws on non-ok HTTP response", async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(500, "Internal Server Error"));

      await expect(ragClient.health()).rejects.toThrow(
        "RAG server error (500): Internal Server Error"
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // ── health ──────────────────────────────────────────────────────────

  describe("health()", () => {
    it("returns health response on success", async () => {
      const expected = { status: "ok", lightrag: true, rag_anything: true };
      mockFetch.mockResolvedValue(mockOkResponse(expected));

      const result = await ragClient.health();
      expect(result).toEqual(expected);
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  // ── ingest ──────────────────────────────────────────────────────────

  describe("ingest()", () => {
    it("sends POST with content, docId, and metadata", async () => {
      const expected = { status: "ok", doc_id: "doc-1" };
      mockFetch.mockResolvedValue(mockOkResponse(expected));

      const result = await ragClient.ingest({
        content: "Hello world",
        docId: "doc-1",
        metadata: { source: "test" },
      });

      expect(result).toEqual(expected);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.content).toBe("Hello world");
      expect(body.doc_id).toBe("doc-1");
      expect(body.metadata).toEqual({ source: "test" });
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  // ── query ───────────────────────────────────────────────────────────

  describe("query()", () => {
    it("sends POST with defaults for mode and topK", async () => {
      const expected = { status: "ok", result: "answer", mode: "hybrid" };
      mockFetch.mockResolvedValue(mockOkResponse(expected));

      const result = await ragClient.query({ query: "test query" });

      expect(result).toEqual(expected);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.mode).toBe("hybrid");
      expect(body.top_k).toBe(5);
      expect(body.query).toBe("test query");
      expect(body.user_id).toBeUndefined();
    });

    it("uses provided mode, topK, and userId", async () => {
      const expected = { status: "ok", result: "answer", mode: "local" };
      mockFetch.mockResolvedValue(mockOkResponse(expected));

      await ragClient.query({
        query: "test",
        mode: "local",
        topK: 10,
        userId: "user-1",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.mode).toBe("local");
      expect(body.top_k).toBe(10);
      expect(body.user_id).toBe("user-1");
    });
  });

  // ── storeMemory ─────────────────────────────────────────────────────

  describe("storeMemory()", () => {
    it("sends POST with defaults for memoryType", async () => {
      const expected = {
        status: "ok",
        doc_id: "mem-1",
        memory_type: "long_term",
        timestamp: "2024-01-01",
      };
      mockFetch.mockResolvedValue(mockOkResponse(expected));

      const result = await ragClient.storeMemory({
        userId: "u1",
        content: "remember this",
      });

      expect(result).toEqual(expected);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.memory_type).toBe("long_term");
      expect(body.user_id).toBe("u1");
    });

    it("uses provided memoryType, tags, and metadata", async () => {
      const expected = {
        status: "ok",
        doc_id: "mem-2",
        memory_type: "episodic",
        timestamp: "2024-01-01",
      };
      mockFetch.mockResolvedValue(mockOkResponse(expected));

      await ragClient.storeMemory({
        userId: "u1",
        content: "event",
        memoryType: "episodic",
        tags: ["tag1"],
        metadata: { key: "val" },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.memory_type).toBe("episodic");
      expect(body.tags).toEqual(["tag1"]);
      expect(body.metadata).toEqual({ key: "val" });
    });
  });

  // ── queryMemory ─────────────────────────────────────────────────────

  describe("queryMemory()", () => {
    it("sends POST with defaults for topK", async () => {
      const expected = {
        status: "ok",
        memories: "remembered stuff",
        query: "test",
        user_id: "u1",
      };
      mockFetch.mockResolvedValue(mockOkResponse(expected));

      const result = await ragClient.queryMemory({
        userId: "u1",
        query: "test",
      });

      expect(result).toEqual(expected);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.top_k).toBe(5);
    });

    it("uses provided topK and memoryType", async () => {
      const expected = {
        status: "ok",
        memories: "stuff",
        query: "q",
        user_id: "u1",
      };
      mockFetch.mockResolvedValue(mockOkResponse(expected));

      await ragClient.queryMemory({
        userId: "u1",
        query: "q",
        memoryType: "short_term",
        topK: 3,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.top_k).toBe(3);
      expect(body.memory_type).toBe("short_term");
    });
  });

  // ── deleteDocuments ─────────────────────────────────────────────────

  describe("deleteDocuments()", () => {
    it("sends POST with doc_ids array", async () => {
      const expected = { status: "ok" };
      mockFetch.mockResolvedValue(mockOkResponse(expected));

      const result = await ragClient.deleteDocuments(["d1", "d2"]);

      expect(result).toEqual(expected);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.doc_ids).toEqual(["d1", "d2"]);
    });
  });

  // ── graphStats ──────────────────────────────────────────────────────

  describe("graphStats()", () => {
    it("sends GET and returns stats", async () => {
      const expected = { nodes: 42, edges: 100 };
      mockFetch.mockResolvedValue(mockOkResponse(expected));

      const result = await ragClient.graphStats();

      expect(result).toEqual(expected);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("/graph/stats");
    });
  });
});

// ---------------------------------------------------------------------------
// Separate test suite for RAG_API_KEY branch (requires fresh module)
// ---------------------------------------------------------------------------
describe("ragClient with RAG_API_KEY set", () => {
  it("includes Authorization header when RAG_API_KEY is present", async () => {
    // Set env before re-importing module
    const origKey = process.env.RAG_API_KEY;
    process.env.RAG_API_KEY = "test-api-key";

    // Clear mock calls and reset modules so the module re-reads process.env
    vi.clearAllMocks();
    vi.resetModules();

    // The vi.mock() factories are still registered, and vi.stubGlobal persists
    const { ragClient: freshClient } = await import("../client");

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: "ok" }),
      text: vi.fn().mockResolvedValue("ok"),
    });

    await freshClient.health();

    // After clearAllMocks, the first call should be from freshClient.health()
    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["Authorization"]).toBe("Bearer test-api-key");

    // Restore env
    if (origKey === undefined) {
      delete process.env.RAG_API_KEY;
    } else {
      process.env.RAG_API_KEY = origKey;
    }
  });
});
