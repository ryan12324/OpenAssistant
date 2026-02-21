const mockFetch = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockUnlink = vi.hoisted(() => vi.fn());
const mockMemoryManager = vi.hoisted(() => ({
  ingestFile: vi.fn(),
}));
const mockExtractFromFile = vi.hoisted(() => vi.fn());
const mockSUPPORTED_EXTENSIONS = vi.hoisted(() => [".pdf", ".txt", ".docx", ".png", ".jpg"]);

vi.stubGlobal("fetch", mockFetch);

vi.mock("fs/promises", () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  unlink: mockUnlink,
}));

vi.mock("@/lib/rag/memory", () => ({
  memoryManager: mockMemoryManager,
}));

vi.mock("@/lib/rag/extractor", () => ({
  extractFromFile: mockExtractFromFile,
  SUPPORTED_EXTENSIONS: mockSUPPORTED_EXTENSIONS,
}));

import {
  downloadAndIngestFile,
  processInboundAttachments,
  formatFileResults,
  type ChatFileResult,
} from "@/lib/integrations/chat/file-handler";

describe("file-handler", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    mockUnlink.mockReset();
    mockMemoryManager.ingestFile.mockReset();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  describe("downloadAndIngestFile", () => {
    it("should return error for unsupported file types", async () => {
      const result = await downloadAndIngestFile({
        url: "https://example.com/file.xyz",
        fileName: "file.xyz",
        userId: "u1",
        source: "Test",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported file type");
      expect(result.fileName).toBe("file.xyz");
    });

    it("should handle file with no extension", async () => {
      const result = await downloadAndIngestFile({
        url: "https://example.com/file",
        fileName: "file",
        userId: "u1",
        source: "Test",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported file type");
    });

    it("should default to .bin extension for empty filename", async () => {
      const result = await downloadAndIngestFile({
        url: "https://example.com/",
        fileName: "",
        userId: "u1",
        source: "Test",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsupported file type: .bin");
    });

    it("should download, extract, and ingest a supported file", async () => {
      const arrayBuffer = new ArrayBuffer(10);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(arrayBuffer),
      });
      mockMemoryManager.ingestFile.mockResolvedValueOnce({
        docId: "doc-123",
        extracted: {
          content: "Hello world",
          tables: [{ data: [] }],
          imageCount: 2,
          keywords: ["hello", "world"],
        },
      });

      const result = await downloadAndIngestFile({
        url: "https://example.com/file.pdf",
        fileName: "file.pdf",
        userId: "u1",
        source: "Telegram",
      });

      expect(result.success).toBe(true);
      expect(result.docId).toBe("doc-123");
      expect(result.contentLength).toBe(11);
      expect(result.tables).toBe(1);
      expect(result.images).toBe(2);
      expect(result.keywords).toEqual(["hello", "world"]);
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockUnlink).toHaveBeenCalled();
    });

    it("should handle download failure (HTTP error)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await downloadAndIngestFile({
        url: "https://example.com/file.pdf",
        fileName: "file.pdf",
        userId: "u1",
        source: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Download failed: HTTP 404");
      expect(mockUnlink).toHaveBeenCalled();
    });

    it("should handle ingest errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      mockMemoryManager.ingestFile.mockRejectedValueOnce(new Error("Ingest failed"));

      const result = await downloadAndIngestFile({
        url: "https://example.com/file.pdf",
        fileName: "file.pdf",
        userId: "u1",
        source: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Ingest failed");
      expect(mockUnlink).toHaveBeenCalled();
    });

    it("should handle non-Error exceptions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      mockMemoryManager.ingestFile.mockRejectedValueOnce("string error");

      const result = await downloadAndIngestFile({
        url: "https://example.com/file.pdf",
        fileName: "file.pdf",
        userId: "u1",
        source: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Processing failed");
    });

    it("should pass custom headers to fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      mockMemoryManager.ingestFile.mockResolvedValueOnce({
        docId: "doc-1",
        extracted: { content: "x", tables: [], imageCount: 0, keywords: [] },
      });

      await downloadAndIngestFile({
        url: "https://example.com/file.txt",
        fileName: "file.txt",
        headers: { Authorization: "Bearer tok" },
        userId: "u1",
        source: "Test",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/file.txt",
        { headers: { Authorization: "Bearer tok" } }
      );
    });

    it("should handle unlink failure silently", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      mockUnlink.mockRejectedValueOnce(new Error("unlink fail"));

      const result = await downloadAndIngestFile({
        url: "https://example.com/file.pdf",
        fileName: "file.pdf",
        userId: "u1",
        source: "Test",
      });

      expect(result.success).toBe(false);
      // Should not throw despite unlink failure
    });
  });

  describe("processInboundAttachments", () => {
    it("should process multiple attachments", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      mockMemoryManager.ingestFile.mockResolvedValueOnce({
        docId: "doc-1",
        extracted: { content: "text", tables: [], imageCount: 0, keywords: [] },
      });

      const results = await processInboundAttachments({
        attachments: [
          { fileId: "f1", fileName: "doc.pdf", url: "https://example.com/doc.pdf" },
          { fileId: "f2", fileName: "nourl.txt" },
        ],
        userId: "u1",
        source: "Test",
      });

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain("No download URL");
    });

    it("should return empty array for empty attachments", async () => {
      const results = await processInboundAttachments({
        attachments: [],
        userId: "u1",
        source: "Test",
      });
      expect(results).toEqual([]);
    });

    it("should pass mimeType and headers through", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
      });
      mockMemoryManager.ingestFile.mockResolvedValueOnce({
        docId: "d1",
        extracted: { content: "x", tables: [], imageCount: 0, keywords: [] },
      });

      await processInboundAttachments({
        attachments: [
          {
            fileId: "f1",
            fileName: "file.pdf",
            mimeType: "application/pdf",
            url: "https://example.com/file.pdf",
          },
        ],
        headers: { Authorization: "Bearer tok" },
        userId: "u1",
        source: "Slack",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/file.pdf",
        { headers: { Authorization: "Bearer tok" } }
      );
    });
  });

  describe("formatFileResults", () => {
    it("should return 'No files processed' for empty results", () => {
      expect(formatFileResults([])).toBe("No files processed.");
    });

    it("should format successful results", () => {
      const results: ChatFileResult[] = [
        { success: true, fileName: "file.pdf", contentLength: 500, tables: 2, images: 3, keywords: ["a"] },
      ];
      const output = formatFileResults(results);
      expect(output).toContain("Processed 1/1 files");
      expect(output).toContain("file.pdf: 500 chars extracted");
      expect(output).toContain("2 tables");
      expect(output).toContain("3 images");
    });

    it("should format failed results", () => {
      const results: ChatFileResult[] = [
        { success: false, fileName: "file.xyz", error: "Unsupported" },
      ];
      const output = formatFileResults(results);
      expect(output).toContain("Processed 0/1 files");
      expect(output).toContain("file.xyz: failed");
      expect(output).toContain("Unsupported");
    });

    it("should handle mixed results", () => {
      const results: ChatFileResult[] = [
        { success: true, fileName: "ok.pdf", contentLength: 100 },
        { success: false, fileName: "fail.xyz", error: "Bad type" },
      ];
      const output = formatFileResults(results);
      expect(output).toContain("Processed 1/2 files");
    });

    it("should omit tables and images when zero", () => {
      const results: ChatFileResult[] = [
        { success: true, fileName: "file.txt", contentLength: 50, tables: 0, images: 0 },
      ];
      const output = formatFileResults(results);
      expect(output).not.toContain("tables");
      expect(output).not.toContain("images");
    });

    it("should omit tables when undefined", () => {
      const results: ChatFileResult[] = [
        { success: true, fileName: "file.txt", contentLength: 50 },
      ];
      const output = formatFileResults(results);
      expect(output).not.toContain("tables");
    });
  });
});
