import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockWriteFile, mockMkdir, mockUnlink, mockExtractFromFile, mockSupportedExtensions, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockWriteFile: vi.fn(),
  mockMkdir: vi.fn(),
  mockUnlink: vi.fn(),
  mockExtractFromFile: vi.fn(),
  mockSupportedExtensions: [".pdf", ".txt", ".docx", ".csv"],
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("fs/promises", () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

vi.mock("crypto", () => ({
  randomUUID: () => "test-uuid-1234",
}));

vi.mock("@/lib/rag/extractor", () => ({
  extractFromFile: (...args: unknown[]) => mockExtractFromFile(...args),
  SUPPORTED_EXTENSIONS: mockSupportedExtensions,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
});

function makeFormDataRequest(fields: Record<string, string | Blob>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/files/extract", {
    method: "POST",
    body: formData,
  });
}

function makeTestFile(name: string, content: string = "test content", size?: number): File {
  const blob = new File([content], name, { type: "application/octet-stream" });
  if (size !== undefined) {
    Object.defineProperty(blob, "size", { value: size, writable: false, configurable: true });
  }
  return blob;
}

describe("POST /api/files/extract", () => {
  it("extracts content from a valid file", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const extracted = {
      mimeType: "text/plain",
      content: "Extracted text",
      enrichedContent: "Enriched text",
      tables: [],
      imageCount: 0,
      keywords: ["test"],
      elements: [],
      qualityScore: 0.9,
      warnings: [],
    };
    mockExtractFromFile.mockResolvedValue(extracted);

    const file = makeTestFile("test.txt");
    const req = makeFormDataRequest({ file });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.fileName).toBe("test.txt");
    expect(json.content).toBe("Extracted text");
    expect(json.mimeType).toBe("text/plain");
    expect(mockUnlink).toHaveBeenCalled();
  });

  it("returns 400 when no file is provided", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const formData = new FormData();
    const req = new Request("http://localhost/api/files/extract", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "No file provided" });
  });

  it("returns 400 when file is too large", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    // Create a request with a mocked formData method
    const fakeFile = {
      name: "large.txt",
      size: 60 * 1024 * 1024,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    };
    const req = {
      formData: () =>
        Promise.resolve({
          get: (key: string) => (key === "file" ? fakeFile : null),
        }),
    };
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("File too large");
  });

  it("returns 400 for unsupported file type", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const file = makeTestFile("test.xyz");
    const req = makeFormDataRequest({ file });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Unsupported file type");
  });

  it("passes enableOcr=true by default", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockExtractFromFile.mockResolvedValue({
      mimeType: "text/plain",
      content: "text",
      enrichedContent: "",
      tables: [],
      imageCount: 0,
      keywords: [],
      elements: [],
      qualityScore: 1,
      warnings: [],
    });

    const file = makeTestFile("test.txt");
    const req = makeFormDataRequest({ file });
    await POST(req as any);

    expect(mockExtractFromFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ enableOcr: true })
    );
  });

  it("passes enableOcr=false when specified", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockExtractFromFile.mockResolvedValue({
      mimeType: "text/plain",
      content: "text",
      enrichedContent: "",
      tables: [],
      imageCount: 0,
      keywords: [],
      elements: [],
      qualityScore: 1,
      warnings: [],
    });

    const file = makeTestFile("test.txt");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("enableOcr", "false");
    const req = new Request("http://localhost/api/files/extract", {
      method: "POST",
      body: formData,
    });
    await POST(req as any);

    expect(mockExtractFromFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ enableOcr: false })
    );
  });

  it("limits elements to 50 in response", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const elements = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    mockExtractFromFile.mockResolvedValue({
      mimeType: "text/plain",
      content: "text",
      enrichedContent: "",
      tables: [],
      imageCount: 0,
      keywords: [],
      elements,
      qualityScore: 1,
      warnings: [],
    });

    const file = makeTestFile("test.txt");
    const req = makeFormDataRequest({ file });
    const res = await POST(req as any);
    const json = await res.json();

    expect(json.elements).toHaveLength(50);
  });

  it("cleans up temp file even when extraction fails", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockExtractFromFile.mockRejectedValue(new Error("Extraction failed"));

    const file = makeTestFile("test.txt");
    const req = makeFormDataRequest({ file });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Extraction failed");
    expect(mockUnlink).toHaveBeenCalled();
  });

  it("handles unlink failure silently during cleanup", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockExtractFromFile.mockResolvedValue({
      mimeType: "text/plain",
      content: "text",
      enrichedContent: "",
      tables: [],
      imageCount: 0,
      keywords: [],
      elements: [],
      qualityScore: 1,
      warnings: [],
    });
    mockUnlink.mockRejectedValue(new Error("unlink failed"));

    const file = makeTestFile("test.txt");
    const req = makeFormDataRequest({ file });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
  });

  it("handles file with no extension (empty pop result)", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    // A file name with a trailing dot — split(".").pop() returns ""
    // which is falsy, triggering the || "" branch
    const file = makeTestFile("noext.");
    const req = makeFormDataRequest({ file });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Unsupported file type: .");
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const formData = new FormData();
    const req = new Request("http://localhost/api/files/extract", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 with error message for Error instances", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockExtractFromFile.mockRejectedValue(new Error("Custom extraction error"));

    const file = makeTestFile("test.txt");
    const req = makeFormDataRequest({ file });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Custom extraction error");
  });

  it("returns 500 with fallback message for non-Error throws", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockExtractFromFile.mockRejectedValue("string error");

    const file = makeTestFile("test.txt");
    const req = makeFormDataRequest({ file });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to extract file");
  });
});
