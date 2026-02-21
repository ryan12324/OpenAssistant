import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – use vi.hoisted() so variables are available in vi.mock() factories
// ---------------------------------------------------------------------------
const {
  mockLogger,
  mockPrismaMemory,
  mockRagClient,
  mockExtractFromFile,
  mockExtractFromBuffer,
} = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  },
  mockPrismaMemory: {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  mockRagClient: {
    storeMemory: vi.fn(),
    queryMemory: vi.fn(),
    deleteDocuments: vi.fn(),
    ingest: vi.fn(),
  },
  mockExtractFromFile: vi.fn(),
  mockExtractFromBuffer: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => mockLogger),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    memory: mockPrismaMemory,
  },
}));

vi.mock("../client", () => ({
  ragClient: mockRagClient,
}));

vi.mock("../extractor", () => ({
  extractFromFile: mockExtractFromFile,
  extractFromBuffer: mockExtractFromBuffer,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { memoryManager } from "../memory";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("memoryManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── store ──────────────────────────────────────────────────────────

  describe("store()", () => {
    it("stores memory in DB and RAG, updates DB with ragDocId", async () => {
      mockPrismaMemory.create.mockResolvedValue({ id: "mem-1" });
      mockRagClient.storeMemory.mockResolvedValue({ doc_id: "rag-1" });
      mockPrismaMemory.update.mockResolvedValue({});

      const id = await memoryManager.store({
        userId: "u1",
        content: "test content",
        tags: ["tag1", "tag2"],
        summary: "a summary",
      });

      expect(id).toBe("mem-1");
      expect(mockPrismaMemory.create).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          type: "long_term",
          content: "test content",
          summary: "a summary",
          tags: JSON.stringify(["tag1", "tag2"]),
        },
      });
      expect(mockRagClient.storeMemory).toHaveBeenCalledWith({
        userId: "u1",
        content: "test content",
        memoryType: "long_term",
        tags: ["tag1", "tag2"],
        metadata: { db_id: "mem-1", summary: "a summary" },
      });
      expect(mockPrismaMemory.update).toHaveBeenCalledWith({
        where: { id: "mem-1" },
        data: { ragDocId: "rag-1" },
      });
    });

    it("uses provided type and handles no tags/summary", async () => {
      mockPrismaMemory.create.mockResolvedValue({ id: "mem-2" });
      mockRagClient.storeMemory.mockResolvedValue({ doc_id: "rag-2" });
      mockPrismaMemory.update.mockResolvedValue({});

      const id = await memoryManager.store({
        userId: "u1",
        content: "content",
        type: "short_term",
      });

      expect(id).toBe("mem-2");
      expect(mockPrismaMemory.create).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          type: "short_term",
          content: "content",
          summary: undefined,
          tags: null,
        },
      });
      expect(mockRagClient.storeMemory).toHaveBeenCalledWith({
        userId: "u1",
        content: "content",
        memoryType: "short_term",
        tags: undefined,
        metadata: { db_id: "mem-2" },
      });
    });

    it("continues and returns id even if RAG storage fails", async () => {
      mockPrismaMemory.create.mockResolvedValue({ id: "mem-3" });
      mockRagClient.storeMemory.mockRejectedValue(new Error("RAG down"));

      const id = await memoryManager.store({
        userId: "u1",
        content: "content",
      });

      expect(id).toBe("mem-3");
      expect(mockPrismaMemory.update).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("handles non-Error RAG failure", async () => {
      mockPrismaMemory.create.mockResolvedValue({ id: "mem-4" });
      mockRagClient.storeMemory.mockRejectedValue("string error");

      const id = await memoryManager.store({
        userId: "u1",
        content: "content",
      });

      expect(id).toBe("mem-4");
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // ── recall ─────────────────────────────────────────────────────────

  describe("recall()", () => {
    it("returns RAG query result on success", async () => {
      mockRagClient.queryMemory.mockResolvedValue({
        memories: "found memories",
      });

      const result = await memoryManager.recall({
        userId: "u1",
        query: "test query",
        type: "long_term",
        limit: 3,
      });

      expect(result).toBe("found memories");
      expect(mockRagClient.queryMemory).toHaveBeenCalledWith({
        userId: "u1",
        query: "test query",
        memoryType: "long_term",
        topK: 3,
      });
    });

    it("uses default limit when not provided", async () => {
      mockRagClient.queryMemory.mockResolvedValue({
        memories: "results",
      });

      await memoryManager.recall({
        userId: "u1",
        query: "q",
      });

      expect(mockRagClient.queryMemory).toHaveBeenCalledWith({
        userId: "u1",
        query: "q",
        memoryType: undefined,
        topK: 5,
      });
    });

    it("falls back to DB on RAG failure with type filter", async () => {
      mockRagClient.queryMemory.mockRejectedValue(new Error("RAG down"));
      mockPrismaMemory.findMany.mockResolvedValue([
        { content: "mem1" },
        { content: "mem2" },
      ]);

      const result = await memoryManager.recall({
        userId: "u1",
        query: "query",
        type: "episodic",
        limit: 2,
      });

      expect(result).toBe("mem1\n\n---\n\nmem2");
      expect(mockPrismaMemory.findMany).toHaveBeenCalledWith({
        where: { userId: "u1", type: "episodic" },
        orderBy: { updatedAt: "desc" },
        take: 2,
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("falls back to DB on RAG failure without type filter", async () => {
      mockRagClient.queryMemory.mockRejectedValue("string error");
      mockPrismaMemory.findMany.mockResolvedValue([
        { content: "only one" },
      ]);

      const result = await memoryManager.recall({
        userId: "u1",
        query: "query",
      });

      expect(result).toBe("only one");
      expect(mockPrismaMemory.findMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
        orderBy: { updatedAt: "desc" },
        take: 5,
      });
    });
  });

  // ── getRecentContext ────────────────────────────────────────────────

  describe("getRecentContext()", () => {
    it("returns short_term memories as string array", async () => {
      mockPrismaMemory.findMany.mockResolvedValue([
        { content: "c1" },
        { content: "c2" },
      ]);

      const result = await memoryManager.getRecentContext("u1", 5);

      expect(result).toEqual(["c1", "c2"]);
      expect(mockPrismaMemory.findMany).toHaveBeenCalledWith({
        where: { userId: "u1", type: "short_term" },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
    });

    it("uses default limit of 10", async () => {
      mockPrismaMemory.findMany.mockResolvedValue([]);

      await memoryManager.getRecentContext("u1");

      expect(mockPrismaMemory.findMany).toHaveBeenCalledWith({
        where: { userId: "u1", type: "short_term" },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    });
  });

  // ── list ───────────────────────────────────────────────────────────

  describe("list()", () => {
    it("returns memories with parsed tags and total count", async () => {
      mockPrismaMemory.findMany.mockResolvedValue([
        { id: "m1", content: "c1", tags: JSON.stringify(["a", "b"]) },
        { id: "m2", content: "c2", tags: null },
      ]);
      mockPrismaMemory.count.mockResolvedValue(10);

      const result = await memoryManager.list({
        userId: "u1",
        type: "long_term",
        limit: 2,
        offset: 1,
      });

      expect(result.total).toBe(10);
      expect(result.memories).toHaveLength(2);
      expect(result.memories[0].tags).toEqual(["a", "b"]);
      expect(result.memories[1].tags).toEqual([]);
      expect(mockPrismaMemory.findMany).toHaveBeenCalledWith({
        where: { userId: "u1", type: "long_term" },
        orderBy: { updatedAt: "desc" },
        take: 2,
        skip: 1,
      });
    });

    it("uses default limit and offset without type filter", async () => {
      mockPrismaMemory.findMany.mockResolvedValue([]);
      mockPrismaMemory.count.mockResolvedValue(0);

      await memoryManager.list({ userId: "u1" });

      expect(mockPrismaMemory.findMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        skip: 0,
      });
      expect(mockPrismaMemory.count).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
    });
  });

  // ── delete ─────────────────────────────────────────────────────────

  describe("delete()", () => {
    it("deletes from RAG and DB when ragDocId exists", async () => {
      mockPrismaMemory.findFirst.mockResolvedValue({
        id: "m1",
        userId: "u1",
        ragDocId: "rag-1",
      });
      mockRagClient.deleteDocuments.mockResolvedValue({ status: "ok" });
      mockPrismaMemory.delete.mockResolvedValue({});

      await memoryManager.delete("m1", "u1");

      expect(mockRagClient.deleteDocuments).toHaveBeenCalledWith(["rag-1"]);
      expect(mockPrismaMemory.delete).toHaveBeenCalledWith({
        where: { id: "m1" },
      });
    });

    it("skips RAG deletion when no ragDocId", async () => {
      mockPrismaMemory.findFirst.mockResolvedValue({
        id: "m1",
        userId: "u1",
        ragDocId: null,
      });
      mockPrismaMemory.delete.mockResolvedValue({});

      await memoryManager.delete("m1", "u1");

      expect(mockRagClient.deleteDocuments).not.toHaveBeenCalled();
      expect(mockPrismaMemory.delete).toHaveBeenCalledWith({
        where: { id: "m1" },
      });
    });

    it("throws when memory not found", async () => {
      mockPrismaMemory.findFirst.mockResolvedValue(null);

      await expect(memoryManager.delete("m1", "u1")).rejects.toThrow(
        "Memory not found"
      );
    });

    it("continues DB deletion even if RAG deletion fails (Error)", async () => {
      mockPrismaMemory.findFirst.mockResolvedValue({
        id: "m1",
        userId: "u1",
        ragDocId: "rag-1",
      });
      mockRagClient.deleteDocuments.mockRejectedValue(new Error("RAG error"));
      mockPrismaMemory.delete.mockResolvedValue({});

      await memoryManager.delete("m1", "u1");

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockPrismaMemory.delete).toHaveBeenCalledWith({
        where: { id: "m1" },
      });
    });

    it("continues DB deletion even if RAG deletion fails (non-Error)", async () => {
      mockPrismaMemory.findFirst.mockResolvedValue({
        id: "m1",
        userId: "u1",
        ragDocId: "rag-1",
      });
      mockRagClient.deleteDocuments.mockRejectedValue("string error");
      mockPrismaMemory.delete.mockResolvedValue({});

      await memoryManager.delete("m1", "u1");

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockPrismaMemory.delete).toHaveBeenCalled();
    });
  });

  // ── ingestDocument ─────────────────────────────────────────────────

  describe("ingestDocument()", () => {
    it("ingests content with title", async () => {
      mockRagClient.ingest.mockResolvedValue({ doc_id: "doc-1" });

      const result = await memoryManager.ingestDocument({
        userId: "u1",
        content: "doc content",
        title: "My Doc",
      });

      expect(result).toBe("doc-1");
      expect(mockRagClient.ingest).toHaveBeenCalledWith({
        content: "doc content",
        metadata: { user_id: "u1", title: "My Doc" },
      });
    });

    it("ingests content without title", async () => {
      mockRagClient.ingest.mockResolvedValue({ doc_id: "doc-2" });

      const result = await memoryManager.ingestDocument({
        userId: "u1",
        content: "doc content",
      });

      expect(result).toBe("doc-2");
      expect(mockRagClient.ingest).toHaveBeenCalledWith({
        content: "doc content",
        metadata: { user_id: "u1" },
      });
    });
  });

  // ── ingestFile ─────────────────────────────────────────────────────

  describe("ingestFile()", () => {
    it("extracts file, ingests into RAG, creates memory record", async () => {
      const extracted = {
        content: "extracted text",
        enrichedContent: "enriched text",
        mimeType: "application/pdf",
        tables: [{ markdown: "| a | b |" }],
        imageCount: 2,
        keywords: ["key1", "key2"],
        qualityScore: 0.9,
        warnings: [],
        elements: [],
      };
      mockExtractFromFile.mockResolvedValue(extracted);
      mockRagClient.ingest.mockResolvedValue({ doc_id: "doc-1" });
      mockPrismaMemory.create.mockResolvedValue({ id: "mem-1" });

      const result = await memoryManager.ingestFile({
        userId: "u1",
        filePath: "/path/to/file.pdf",
        title: "My PDF",
      });

      expect(result.docId).toBe("doc-1");
      expect(result.extracted).toBe(extracted);
      expect(mockExtractFromFile).toHaveBeenCalledWith("/path/to/file.pdf", undefined);
      expect(mockRagClient.ingest).toHaveBeenCalledWith({
        content: "enriched text",
        metadata: {
          user_id: "u1",
          title: "My PDF",
          mime_type: "application/pdf",
          tables_count: "1",
          image_count: "2",
          keywords: "key1, key2",
          quality_score: "0.9",
        },
      });
      expect(mockPrismaMemory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "u1",
          type: "long_term",
          ragDocId: "doc-1",
        }),
      });
    });

    it("uses filename from path when no title given, no keywords, no qualityScore", async () => {
      const extracted = {
        content: "text",
        enrichedContent: "enriched",
        mimeType: "text/plain",
        tables: [],
        imageCount: 0,
        keywords: [],
        qualityScore: undefined,
        warnings: [],
        elements: [],
      };
      mockExtractFromFile.mockResolvedValue(extracted);
      mockRagClient.ingest.mockResolvedValue({ doc_id: "doc-2" });
      mockPrismaMemory.create.mockResolvedValue({ id: "mem-2" });

      const result = await memoryManager.ingestFile({
        userId: "u1",
        filePath: "/some/path/readme.txt",
        extractOptions: { enableOcr: false },
      });

      expect(result.docId).toBe("doc-2");
      expect(mockRagClient.ingest).toHaveBeenCalledWith({
        content: "enriched",
        metadata: {
          user_id: "u1",
          title: "readme.txt",
          mime_type: "text/plain",
          tables_count: "0",
          image_count: "0",
        },
      });
    });

    it("uses 'Untitled' when filePath has no basename", async () => {
      const extracted = {
        content: "",
        enrichedContent: "",
        mimeType: "application/octet-stream",
        tables: [],
        imageCount: 0,
        keywords: [],
        qualityScore: undefined,
        warnings: [],
        elements: [],
      };
      mockExtractFromFile.mockResolvedValue(extracted);
      mockRagClient.ingest.mockResolvedValue({ doc_id: "doc-3" });
      mockPrismaMemory.create.mockResolvedValue({ id: "mem-3" });

      const result = await memoryManager.ingestFile({
        userId: "u1",
        filePath: "/",
      });

      expect(result.docId).toBe("doc-3");
    });
  });

  // ── ingestFileBuffer ───────────────────────────────────────────────

  describe("ingestFileBuffer()", () => {
    it("extracts buffer, ingests into RAG, creates memory record", async () => {
      const extracted = {
        content: "buffer text",
        enrichedContent: "enriched buffer text",
        mimeType: "image/png",
        tables: [],
        imageCount: 1,
        keywords: ["ocr", "text", "in", "image", "more", "extra"],
        qualityScore: 0.85,
        warnings: [],
        elements: [],
      };
      mockExtractFromBuffer.mockResolvedValue(extracted);
      mockRagClient.ingest.mockResolvedValue({ doc_id: "doc-buf-1" });
      mockPrismaMemory.create.mockResolvedValue({ id: "mem-buf-1" });

      const buf = Buffer.from("fake data");
      const result = await memoryManager.ingestFileBuffer({
        userId: "u1",
        buffer: buf,
        fileName: "image.png",
        mimeType: "image/png",
      });

      expect(result.docId).toBe("doc-buf-1");
      expect(result.extracted).toBe(extracted);
      expect(mockExtractFromBuffer).toHaveBeenCalledWith(
        buf, "image/png", "image.png", undefined
      );
      expect(mockRagClient.ingest).toHaveBeenCalledWith({
        content: "enriched buffer text",
        metadata: {
          user_id: "u1",
          title: "image.png",
          mime_type: "image/png",
          tables_count: "0",
          image_count: "1",
          keywords: "ocr, text, in, image, more, extra",
          quality_score: "0.85",
        },
      });
      const createCall = mockPrismaMemory.create.mock.calls[0][0];
      const parsedTags = JSON.parse(createCall.data.tags);
      expect(parsedTags).toEqual(["document", "ingested", "ocr", "text", "in", "image", "more"]);
    });

    it("handles buffer without optional mimeType", async () => {
      const extracted = {
        content: "text",
        enrichedContent: "enriched",
        mimeType: "application/octet-stream",
        tables: [],
        imageCount: 0,
        keywords: [],
        qualityScore: undefined,
        warnings: [],
        elements: [],
      };
      mockExtractFromBuffer.mockResolvedValue(extracted);
      mockRagClient.ingest.mockResolvedValue({ doc_id: "doc-buf-2" });
      mockPrismaMemory.create.mockResolvedValue({ id: "mem-buf-2" });

      const buf = Buffer.from("data");
      await memoryManager.ingestFileBuffer({
        userId: "u1",
        buffer: buf,
        fileName: "file.bin",
        extractOptions: { enableOcr: false },
      });

      expect(mockExtractFromBuffer).toHaveBeenCalledWith(
        buf, undefined, "file.bin", { enableOcr: false }
      );
    });
  });
});
