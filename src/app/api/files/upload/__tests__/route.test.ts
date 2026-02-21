import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockWriteFile, mockMkdir, mockUnlink, mockMemoryManager, mockSupportedExtensions, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockWriteFile: vi.fn(),
  mockMkdir: vi.fn(),
  mockUnlink: vi.fn(),
  mockMemoryManager: { ingestFile: vi.fn() },
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
  randomUUID: () => "test-uuid-5678",
}));

vi.mock("@/lib/rag/memory", () => ({
  memoryManager: mockMemoryManager,
}));

vi.mock("@/lib/rag/extractor", () => ({
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

function makeTestFile(name: string, content: string = "test", size?: number): File {
  const blob = new File([content], name, { type: "application/octet-stream" });
  if (size !== undefined) {
    Object.defineProperty(blob, "size", { value: size, writable: false, configurable: true });
  }
  return blob;
}

describe("POST /api/files/upload", () => {
  it("uploads and ingests a file successfully", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.ingestFile.mockResolvedValue({
      docId: "doc-1",
      extracted: {
        mimeType: "text/plain",
        content: "File content",
        tables: [],
        imageCount: 0,
        keywords: ["key1", "key2"],
        qualityScore: 0.95,
        warnings: [],
      },
    });

    const file = makeTestFile("report.txt");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", "My Report");

    const req = new Request("http://localhost/api/files/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.docId).toBe("doc-1");
    expect(json.fileName).toBe("report.txt");
    expect(mockMemoryManager.ingestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        title: "My Report",
        extractOptions: expect.objectContaining({ enableOcr: true }),
      })
    );
    // Cleanup is called (non-blocking)
    expect(mockUnlink).toHaveBeenCalled();
  });

  it("uses file name as title when title is not provided", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.ingestFile.mockResolvedValue({
      docId: "doc-2",
      extracted: {
        mimeType: "text/plain",
        content: "content",
        tables: [],
        imageCount: 0,
        keywords: [],
        qualityScore: 1,
        warnings: [],
      },
    });

    const file = makeTestFile("auto-title.txt");
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request("http://localhost/api/files/upload", {
      method: "POST",
      body: formData,
    });
    await POST(req as any);

    expect(mockMemoryManager.ingestFile).toHaveBeenCalledWith(
      expect.objectContaining({ title: "auto-title.txt" })
    );
  });

  it("returns 400 when no file is provided", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const formData = new FormData();
    const req = new Request("http://localhost/api/files/upload", {
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

    // Create a request with a mocked formData method to control file.size
    const fakeFile = {
      name: "big.txt",
      size: 60 * 1024 * 1024,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    };
    const req = {
      formData: () =>
        Promise.resolve({
          get: (key: string) => {
            if (key === "file") return fakeFile;
            if (key === "title") return null;
            if (key === "enableOcr") return null;
            return null;
          },
        }),
    };
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("File too large");
  });

  it("returns 400 for unsupported file type", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const file = makeTestFile("bad.xyz");
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request("http://localhost/api/files/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Unsupported file type");
  });

  it("passes enableOcr=false when specified", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.ingestFile.mockResolvedValue({
      docId: "doc-3",
      extracted: {
        mimeType: "text/plain",
        content: "content",
        tables: [],
        imageCount: 0,
        keywords: [],
        qualityScore: 1,
        warnings: [],
      },
    });

    const file = makeTestFile("test.txt");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("enableOcr", "false");

    const req = new Request("http://localhost/api/files/upload", {
      method: "POST",
      body: formData,
    });
    await POST(req as any);

    expect(mockMemoryManager.ingestFile).toHaveBeenCalledWith(
      expect.objectContaining({
        extractOptions: expect.objectContaining({ enableOcr: false }),
      })
    );
  });

  it("limits keywords to 20 in response", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const keywords = Array.from({ length: 30 }, (_, i) => `kw${i}`);
    mockMemoryManager.ingestFile.mockResolvedValue({
      docId: "doc-4",
      extracted: {
        mimeType: "text/plain",
        content: "content",
        tables: [],
        imageCount: 0,
        keywords,
        qualityScore: 1,
        warnings: [],
      },
    });

    const file = makeTestFile("test.txt");
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request("http://localhost/api/files/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(json.keywords).toHaveLength(20);
  });

  it("handles file with no extension (empty pop result)", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    // A file name with a trailing dot — split(".").pop() returns ""
    // which is falsy, triggering the || "" branch on line 55
    const file = makeTestFile("noext.");
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request("http://localhost/api/files/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Unsupported file type: .");
  });

  it("calls unlink for cleanup (covers unlink .catch callback)", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockUnlink.mockRejectedValue(new Error("unlink failed"));
    mockMemoryManager.ingestFile.mockResolvedValue({
      docId: "doc-cleanup",
      extracted: {
        mimeType: "text/plain",
        content: "content",
        tables: [],
        imageCount: 0,
        keywords: [],
        qualityScore: 1,
        warnings: [],
      },
    });

    const file = makeTestFile("test.txt");
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request("http://localhost/api/files/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as any);

    // unlink is called in a fire-and-forget manner with .catch(() => {})
    expect(res.status).toBe(200);
    expect(mockUnlink).toHaveBeenCalled();
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const formData = new FormData();
    const req = new Request("http://localhost/api/files/upload", {
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
    mockMemoryManager.ingestFile.mockRejectedValue(new Error("Ingest failed"));

    const file = makeTestFile("test.txt");
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request("http://localhost/api/files/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Ingest failed");
  });

  it("returns 500 with fallback message for non-Error throws", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockMemoryManager.ingestFile.mockRejectedValue("string error");

    const file = makeTestFile("test.txt");
    const formData = new FormData();
    formData.append("file", file);

    const req = new Request("http://localhost/api/files/upload", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Failed to process file");
  });
});
