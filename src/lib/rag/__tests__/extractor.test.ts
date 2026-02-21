import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – use vi.hoisted()
// ---------------------------------------------------------------------------
const {
  mockExtractFile,
  mockExtractBytes,
  mockBatchExtractFiles,
  mockDetectMimeTypeFromPath,
} = vi.hoisted(() => ({
  mockExtractFile: vi.fn(),
  mockExtractBytes: vi.fn(),
  mockBatchExtractFiles: vi.fn(),
  mockDetectMimeTypeFromPath: vi.fn(),
}));

vi.mock("@kreuzberg/node", () => ({
  extractFile: mockExtractFile,
  extractBytes: mockExtractBytes,
  batchExtractFiles: mockBatchExtractFiles,
  detectMimeTypeFromPath: mockDetectMimeTypeFromPath,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import {
  extractFromFile,
  extractFromBuffer,
  extractBatch,
  detectMimeType,
  SUPPORTED_EXTENSIONS,
  SUPPORTED_MIME_TYPES,
} from "../extractor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeExtractionResult(overrides: Record<string, unknown> = {}) {
  return {
    content: "Hello world",
    mimeType: "text/plain",
    tables: [],
    images: [],
    elements: [],
    extractedKeywords: [],
    processingWarnings: [],
    qualityScore: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("extractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── buildConfig (tested through extractFromFile) ────────────────────

  describe("buildConfig", () => {
    it("enables OCR with default language when enableOcr is true", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      await extractFromFile("/path/to/file.pdf");

      const config = mockExtractFile.mock.calls[0][2];
      expect(config.ocr).toEqual({ backend: "tesseract", language: "eng" });
      expect(config.enableQualityProcessing).toBe(true);
    });

    it("uses custom OCR language", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      await extractFromFile("/path/to/file.pdf", {
        enableOcr: true,
        ocrLanguage: "eng+fra",
      });

      const config = mockExtractFile.mock.calls[0][2];
      expect(config.ocr.language).toBe("eng+fra");
    });

    it("disables OCR when enableOcr is false", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      await extractFromFile("/path/to/file.pdf", { enableOcr: false });

      const config = mockExtractFile.mock.calls[0][2];
      expect(config.ocr).toBeUndefined();
    });

    it("falls back to 'eng' when ocrLanguage is empty/falsy", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      await extractFromFile("/path/to/file.pdf", {
        enableOcr: true,
        ocrLanguage: "",
      });

      const config = mockExtractFile.mock.calls[0][2];
      expect(config.ocr.language).toBe("eng");
    });

    it("disables quality processing when enableQualityProcessing is false", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      await extractFromFile("/path/to/file.pdf", {
        enableQualityProcessing: false,
      });

      const config = mockExtractFile.mock.calls[0][2];
      expect(config.enableQualityProcessing).toBeUndefined();
    });
  });

  // ── processResult (tested through extractFromFile) ──────────────────

  describe("processResult", () => {
    it("extracts tables from markdown format", async () => {
      const result = makeExtractionResult({
        tables: [{ markdown: "| A | B |" }],
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.tables).toEqual(["| A | B |"]);
    });

    it("falls back to cells format when no markdown", async () => {
      const result = makeExtractionResult({
        tables: [{ cells: [["a", "b"], ["c", "d"]] }],
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.tables).toEqual(["a | b\nc | d"]);
    });

    it("returns empty string for table with neither markdown nor cells", async () => {
      const result = makeExtractionResult({
        tables: [{}],
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.tables).toEqual([""]);
    });

    it("defaults to empty array when tables is undefined", async () => {
      const result = makeExtractionResult({ tables: undefined });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.tables).toEqual([]);
    });

    it("defaults to empty array when elements is undefined", async () => {
      const result = makeExtractionResult({ elements: undefined });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.elements).toEqual([]);
    });

    it("extracts elements with type and text", async () => {
      const result = makeExtractionResult({
        elements: [
          { elementType: "heading", text: "Title" },
          { elementType: undefined, text: undefined },
        ],
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.elements).toEqual([
        { type: "heading", text: "Title" },
        { type: "unknown", text: "" },
      ]);
    });

    it("extracts keywords from extractedKeywords", async () => {
      const result = makeExtractionResult({
        extractedKeywords: [{ text: "keyword1" }, { text: "keyword2" }],
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.keywords).toEqual(["keyword1", "keyword2"]);
    });

    it("defaults to empty array when extractedKeywords is undefined", async () => {
      const result = makeExtractionResult({ extractedKeywords: undefined });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.keywords).toEqual([]);
    });

    it("counts images", async () => {
      const result = makeExtractionResult({
        images: [{ data: "img1" }, { data: "img2" }],
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.imageCount).toBe(2);
    });

    it("handles missing images array", async () => {
      const result = makeExtractionResult({ images: undefined });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.imageCount).toBe(0);
    });

    it("extracts processing warnings", async () => {
      const result = makeExtractionResult({
        processingWarnings: [
          { source: "ocr", message: "low quality" },
        ],
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.warnings).toEqual(["ocr: low quality"]);
    });

    it("defaults to empty array when processingWarnings is undefined", async () => {
      const result = makeExtractionResult({ processingWarnings: undefined });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.warnings).toEqual([]);
    });

    it("uses qualityScore when available", async () => {
      const result = makeExtractionResult({ qualityScore: 0.95 });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.qualityScore).toBe(0.95);
    });

    it("sets qualityScore to undefined when null", async () => {
      const result = makeExtractionResult({ qualityScore: null });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.qualityScore).toBeUndefined();
    });

    it("defaults content and mimeType for missing fields", async () => {
      const result = makeExtractionResult({
        content: undefined,
        mimeType: undefined,
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.content).toBe("");
      expect(doc.mimeType).toBe("application/octet-stream");
    });

    // ── enrichedContent building ───────────────────────────────────────

    it("includes fileName in enrichedContent header", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.enrichedContent).toContain("[Document: file.pdf]");
    });

    it("includes mimeType in enrichedContent header", async () => {
      const result = makeExtractionResult({ mimeType: "application/pdf" });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.enrichedContent).toContain("[Type: application/pdf]");
    });

    it("includes keywords in enrichedContent header", async () => {
      const result = makeExtractionResult({
        extractedKeywords: [{ text: "k1" }, { text: "k2" }],
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.enrichedContent).toContain("[Keywords: k1, k2]");
    });

    it("includes image count in enrichedContent header", async () => {
      const result = makeExtractionResult({
        images: [{ data: "img1" }],
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.enrichedContent).toContain("[Images: 1]");
    });

    it("omits image count when zero", async () => {
      const result = makeExtractionResult({ images: [] });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.enrichedContent).not.toContain("[Images:");
    });

    it("omits keywords line when no keywords", async () => {
      const result = makeExtractionResult({ extractedKeywords: [] });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.enrichedContent).not.toContain("[Keywords:");
    });

    it("appends tables as markdown sections", async () => {
      const result = makeExtractionResult({
        tables: [{ markdown: "| A | B |" }, { markdown: "| C | D |" }],
      });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.enrichedContent).toContain("## Extracted Tables");
      expect(doc.enrichedContent).toContain("### Table 1");
      expect(doc.enrichedContent).toContain("| A | B |");
      expect(doc.enrichedContent).toContain("### Table 2");
      expect(doc.enrichedContent).toContain("| C | D |");
    });

    it("does not include table section when no tables", async () => {
      const result = makeExtractionResult({ tables: [] });
      mockExtractFile.mockResolvedValue(result);

      const doc = await extractFromFile("/path/to/file.pdf");

      expect(doc.enrichedContent).not.toContain("## Extracted Tables");
    });

    it("omits fileName from header when not provided (via processResult)", async () => {
      mockExtractBytes.mockResolvedValue(makeExtractionResult());

      const doc = await extractFromBuffer(Buffer.from("data"));

      expect(doc.enrichedContent).not.toContain("[Document:");
    });

    it("omits mimeType header when missing", async () => {
      const result = makeExtractionResult({ mimeType: undefined });
      mockExtractBytes.mockResolvedValue(result);

      const doc = await extractFromBuffer(Buffer.from("data"));

      expect(doc.enrichedContent).not.toContain("[Type:");
    });
  });

  // ── extractFromFile ─────────────────────────────────────────────────

  describe("extractFromFile()", () => {
    it("calls extractFile with correct arguments and default options", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      await extractFromFile("/some/path/doc.pdf");

      expect(mockExtractFile).toHaveBeenCalledWith(
        "/some/path/doc.pdf",
        null,
        expect.any(Object)
      );
    });

    it("merges custom options with defaults", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      await extractFromFile("/path/file.pdf", {
        enableOcr: false,
        extractTables: false,
      });

      const config = mockExtractFile.mock.calls[0][2];
      expect(config.ocr).toBeUndefined();
    });

    it("uses filePath basename as fileName", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      const doc = await extractFromFile("/deep/nested/report.docx");

      expect(doc.enrichedContent).toContain("[Document: report.docx]");
    });

    it("uses full path as fileName when no slashes", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      const doc = await extractFromFile("simple.txt");

      expect(doc.enrichedContent).toContain("[Document: simple.txt]");
    });

    it("falls back to full path when path ends with slash (pop returns empty string)", async () => {
      mockExtractFile.mockResolvedValue(makeExtractionResult());

      const doc = await extractFromFile("/path/to/dir/");

      // split("/").pop() returns "" which is falsy, so falls back to the full path
      expect(doc.enrichedContent).toContain("[Document: /path/to/dir/]");
    });
  });

  // ── extractFromBuffer ───────────────────────────────────────────────

  describe("extractFromBuffer()", () => {
    it("calls extractBytes with buffer and default mime type", async () => {
      mockExtractBytes.mockResolvedValue(makeExtractionResult());

      await extractFromBuffer(Buffer.from("data"));

      expect(mockExtractBytes).toHaveBeenCalledWith(
        expect.any(Buffer),
        "application/octet-stream",
        expect.any(Object)
      );
    });

    it("uses provided mimeType", async () => {
      mockExtractBytes.mockResolvedValue(makeExtractionResult());

      await extractFromBuffer(Buffer.from("data"), "image/png");

      expect(mockExtractBytes).toHaveBeenCalledWith(
        expect.any(Buffer),
        "image/png",
        expect.any(Object)
      );
    });

    it("passes fileName to processResult", async () => {
      mockExtractBytes.mockResolvedValue(makeExtractionResult());

      const doc = await extractFromBuffer(
        Buffer.from("data"),
        "text/plain",
        "notes.txt"
      );

      expect(doc.enrichedContent).toContain("[Document: notes.txt]");
    });

    it("merges custom options", async () => {
      mockExtractBytes.mockResolvedValue(makeExtractionResult());

      await extractFromBuffer(Buffer.from("data"), undefined, undefined, {
        enableOcr: false,
      });

      const config = mockExtractBytes.mock.calls[0][2];
      expect(config.ocr).toBeUndefined();
    });
  });

  // ── extractBatch ────────────────────────────────────────────────────

  describe("extractBatch()", () => {
    it("calls batchExtractFiles and processes all results", async () => {
      const results = [
        makeExtractionResult({ content: "file1" }),
        makeExtractionResult({ content: "file2" }),
      ];
      mockBatchExtractFiles.mockResolvedValue(results);

      const docs = await extractBatch(["/path/a.pdf", "/path/b.docx"]);

      expect(docs).toHaveLength(2);
      expect(docs[0].content).toBe("file1");
      expect(docs[1].content).toBe("file2");
      expect(docs[0].enrichedContent).toContain("[Document: a.pdf]");
      expect(docs[1].enrichedContent).toContain("[Document: b.docx]");
    });

    it("merges custom options with defaults", async () => {
      mockBatchExtractFiles.mockResolvedValue([]);

      await extractBatch(["/path/a.pdf"], { enableOcr: false });

      const config = mockBatchExtractFiles.mock.calls[0][1];
      expect(config.ocr).toBeUndefined();
    });

    it("falls back to full path when batch path ends with slash", async () => {
      const results = [makeExtractionResult({ content: "data" })];
      mockBatchExtractFiles.mockResolvedValue(results);

      const docs = await extractBatch(["/path/to/dir/"]);

      // split("/").pop() returns "" which is falsy, so falls back to full path
      expect(docs[0].enrichedContent).toContain("[Document: /path/to/dir/]");
    });
  });

  // ── detectMimeType ──────────────────────────────────────────────────

  describe("detectMimeType()", () => {
    it("returns MIME type from kreuzberg", () => {
      mockDetectMimeTypeFromPath.mockReturnValue("application/pdf");

      const result = detectMimeType("/path/file.pdf");

      expect(result).toBe("application/pdf");
    });

    it("returns null when detection throws", () => {
      mockDetectMimeTypeFromPath.mockImplementation(() => {
        throw new Error("unknown extension");
      });

      const result = detectMimeType("/path/file.xyz");

      expect(result).toBeNull();
    });
  });

  // ── exported constants ──────────────────────────────────────────────

  describe("constants", () => {
    it("SUPPORTED_EXTENSIONS is a non-empty array of strings starting with '.'", () => {
      expect(Array.isArray(SUPPORTED_EXTENSIONS)).toBe(true);
      expect(SUPPORTED_EXTENSIONS.length).toBeGreaterThan(0);
      for (const ext of SUPPORTED_EXTENSIONS) {
        expect(ext).toMatch(/^\./);
      }
    });

    it("SUPPORTED_MIME_TYPES is a non-empty array of valid MIME types", () => {
      expect(Array.isArray(SUPPORTED_MIME_TYPES)).toBe(true);
      expect(SUPPORTED_MIME_TYPES.length).toBeGreaterThan(0);
      for (const mime of SUPPORTED_MIME_TYPES) {
        expect(mime).toMatch(/^[a-z]+\//);
      }
    });
  });
});
