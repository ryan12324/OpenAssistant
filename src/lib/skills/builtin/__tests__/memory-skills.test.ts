import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – use vi.hoisted()
// ---------------------------------------------------------------------------
const { mockMemoryManager } = vi.hoisted(() => ({
  mockMemoryManager: {
    store: vi.fn(),
    recall: vi.fn(),
    ingestDocument: vi.fn(),
    ingestFile: vi.fn(),
  },
}));

vi.mock("@/lib/rag/memory", () => ({
  memoryManager: mockMemoryManager,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import {
  saveMemory,
  recallMemory,
  ingestDocument,
  ingestFile,
  memorySkills,
} from "../memory-skills";

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------
const ctx = { userId: "user-1", conversationId: "conv-1" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("memory-skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("memorySkills array", () => {
    it("exports all four skills", () => {
      expect(memorySkills).toHaveLength(4);
      expect(memorySkills).toEqual([saveMemory, recallMemory, ingestDocument, ingestFile]);
    });
  });

  // ── saveMemory ──────────────────────────────────────────────────────

  describe("saveMemory", () => {
    it("has correct metadata", () => {
      expect(saveMemory.id).toBe("save_memory");
      expect(saveMemory.category).toBe("memory");
      expect(saveMemory.parameters.length).toBeGreaterThan(0);
    });

    it("stores memory with tags and custom type", async () => {
      mockMemoryManager.store.mockResolvedValue("mem-1");

      const result = await saveMemory.execute(
        { content: "remember this", tags: "tag1, tag2", memory_type: "episodic" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("mem-1");
      expect(result.output).toContain("episodic");
      expect(result.data).toEqual({ id: "mem-1", memoryType: "episodic" });
      expect(mockMemoryManager.store).toHaveBeenCalledWith({
        userId: "user-1",
        content: "remember this",
        type: "episodic",
        tags: ["tag1", "tag2"],
      });
    });

    it("stores memory without tags and defaults to long_term", async () => {
      mockMemoryManager.store.mockResolvedValue("mem-2");

      const result = await saveMemory.execute(
        { content: "just content" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("long_term");
      expect(mockMemoryManager.store).toHaveBeenCalledWith({
        userId: "user-1",
        content: "just content",
        type: "long_term",
        tags: undefined,
      });
    });
  });

  // ── recallMemory ────────────────────────────────────────────────────

  describe("recallMemory", () => {
    it("has correct metadata", () => {
      expect(recallMemory.id).toBe("recall_memory");
      expect(recallMemory.category).toBe("memory");
    });

    it("recalls memories with type filter", async () => {
      mockMemoryManager.recall.mockResolvedValue("found something");

      const result = await recallMemory.execute(
        { query: "what was that?", memory_type: "short_term" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("found something");
      expect(mockMemoryManager.recall).toHaveBeenCalledWith({
        userId: "user-1",
        query: "what was that?",
        type: "short_term",
      });
    });

    it("returns fallback message when no memories found", async () => {
      mockMemoryManager.recall.mockResolvedValue("");

      const result = await recallMemory.execute(
        { query: "unknown topic" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe("No relevant memories found.");
    });

    it("returns result when memories found without type", async () => {
      mockMemoryManager.recall.mockResolvedValue("some memory");

      const result = await recallMemory.execute(
        { query: "something" },
        ctx
      );

      expect(result.output).toBe("some memory");
      expect(mockMemoryManager.recall).toHaveBeenCalledWith({
        userId: "user-1",
        query: "something",
        type: undefined,
      });
    });
  });

  // ── ingestDocument ──────────────────────────────────────────────────

  describe("ingestDocument", () => {
    it("has correct metadata", () => {
      expect(ingestDocument.id).toBe("ingest_document");
      expect(ingestDocument.category).toBe("memory");
    });

    it("ingests document with title", async () => {
      mockMemoryManager.ingestDocument.mockResolvedValue("doc-1");

      const result = await ingestDocument.execute(
        { content: "doc content", title: "My Document" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("doc-1");
      expect(result.data).toEqual({ docId: "doc-1" });
      expect(mockMemoryManager.ingestDocument).toHaveBeenCalledWith({
        userId: "user-1",
        content: "doc content",
        title: "My Document",
      });
    });

    it("ingests document without title", async () => {
      mockMemoryManager.ingestDocument.mockResolvedValue("doc-2");

      const result = await ingestDocument.execute(
        { content: "doc content" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(mockMemoryManager.ingestDocument).toHaveBeenCalledWith({
        userId: "user-1",
        content: "doc content",
        title: undefined,
      });
    });
  });

  // ── ingestFile ──────────────────────────────────────────────────────

  describe("ingestFile", () => {
    it("has correct metadata", () => {
      expect(ingestFile.id).toBe("ingest_file");
      expect(ingestFile.category).toBe("memory");
    });

    it("ingests file with full extracted data", async () => {
      mockMemoryManager.ingestFile.mockResolvedValue({
        docId: "file-doc-1",
        extracted: {
          content: "file content here",
          mimeType: "application/pdf",
          tables: ["table1"],
          imageCount: 3,
          keywords: ["key1", "key2"],
          qualityScore: 0.85,
          warnings: ["ocr: low contrast"],
          elements: [],
          enrichedContent: "enriched",
        },
      });

      const result = await ingestFile.execute(
        {
          file_path: "/uploads/doc.pdf",
          title: "My PDF",
          enable_ocr: true,
        },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("file-doc-1");
      expect(result.output).toContain("application/pdf");
      expect(result.output).toContain("Tables: 1");
      expect(result.output).toContain("Images: 3");
      expect(result.output).toContain("Keywords: key1, key2");
      expect(result.output).toContain("Quality: 85%");
      expect(result.output).toContain("Warnings: ocr: low contrast");
      expect(result.data).toEqual({
        docId: "file-doc-1",
        mimeType: "application/pdf",
        contentLength: 17,
        tables: 1,
        images: 3,
        keywords: ["key1", "key2"],
      });
    });

    it("omits optional fields from summary when they are empty/zero", async () => {
      mockMemoryManager.ingestFile.mockResolvedValue({
        docId: "file-doc-2",
        extracted: {
          content: "text",
          mimeType: "text/plain",
          tables: [],
          imageCount: 0,
          keywords: [],
          qualityScore: undefined,
          warnings: [],
          elements: [],
          enrichedContent: "enriched",
        },
      });

      const result = await ingestFile.execute(
        { file_path: "/uploads/file.txt" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).not.toContain("Tables:");
      expect(result.output).not.toContain("Images:");
      expect(result.output).not.toContain("Keywords:");
      expect(result.output).not.toContain("Quality:");
      expect(result.output).not.toContain("Warnings:");
    });

    it("uses enable_ocr: true when enable_ocr is not explicitly false", async () => {
      mockMemoryManager.ingestFile.mockResolvedValue({
        docId: "file-doc-3",
        extracted: {
          content: "",
          mimeType: "text/plain",
          tables: [],
          imageCount: 0,
          keywords: [],
          qualityScore: undefined,
          warnings: [],
          elements: [],
          enrichedContent: "",
        },
      });

      await ingestFile.execute({ file_path: "/uploads/f.txt" }, ctx);

      expect(mockMemoryManager.ingestFile).toHaveBeenCalledWith({
        userId: "user-1",
        filePath: "/uploads/f.txt",
        title: undefined,
        extractOptions: { enableOcr: true },
      });
    });

    it("disables OCR when enable_ocr is explicitly false", async () => {
      mockMemoryManager.ingestFile.mockResolvedValue({
        docId: "file-doc-4",
        extracted: {
          content: "",
          mimeType: "text/plain",
          tables: [],
          imageCount: 0,
          keywords: [],
          qualityScore: undefined,
          warnings: [],
          elements: [],
          enrichedContent: "",
        },
      });

      await ingestFile.execute(
        { file_path: "/uploads/f.txt", enable_ocr: false },
        ctx
      );

      expect(mockMemoryManager.ingestFile).toHaveBeenCalledWith({
        userId: "user-1",
        filePath: "/uploads/f.txt",
        title: undefined,
        extractOptions: { enableOcr: false },
      });
    });

    it("trims keywords to first 10 in summary", async () => {
      const manyKeywords = Array.from({ length: 15 }, (_, i) => `kw${i}`);
      mockMemoryManager.ingestFile.mockResolvedValue({
        docId: "file-doc-5",
        extracted: {
          content: "text",
          mimeType: "text/plain",
          tables: [],
          imageCount: 0,
          keywords: manyKeywords,
          qualityScore: null,
          warnings: [],
          elements: [],
          enrichedContent: "",
        },
      });

      const result = await ingestFile.execute(
        { file_path: "/uploads/f.txt" },
        ctx
      );

      expect(result.output).toContain("kw9");
      expect(result.output).not.toContain("kw10");
    });

    it("handles qualityScore of 0 (falsy but valid)", async () => {
      mockMemoryManager.ingestFile.mockResolvedValue({
        docId: "file-doc-6",
        extracted: {
          content: "text",
          mimeType: "text/plain",
          tables: [],
          imageCount: 0,
          keywords: [],
          qualityScore: 0,
          warnings: [],
          elements: [],
          enrichedContent: "",
        },
      });

      const result = await ingestFile.execute(
        { file_path: "/uploads/f.txt" },
        ctx
      );

      expect(result.output).toContain("Quality: 0%");
    });
  });
});
