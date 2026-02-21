import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { webSearch, fetchUrl, webSkills } from "../web-skills";

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------
const ctx = { userId: "user-1", conversationId: "conv-1" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("web-skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("webSkills array", () => {
    it("exports both skills", () => {
      expect(webSkills).toHaveLength(2);
      expect(webSkills).toEqual([webSearch, fetchUrl]);
    });
  });

  // ── webSearch ───────────────────────────────────────────────────────

  describe("webSearch", () => {
    it("has correct metadata", () => {
      expect(webSearch.id).toBe("web_search");
      expect(webSearch.category).toBe("web");
    });

    it("returns results with AbstractText and RelatedTopics", async () => {
      mockFetch.mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          AbstractText: "This is a summary",
          RelatedTopics: [
            { Text: "Topic 1" },
            { Text: "Topic 2" },
            { Text: "Topic 3" },
            { Text: "Topic 4" },
            { Text: "Topic 5" },
            { Text: "Topic 6" }, // Should be excluded (only first 5)
          ],
        }),
      });

      const result = await webSearch.execute({ query: "test query" }, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain("**Summary:** This is a summary");
      expect(result.output).toContain("- Topic 1");
      expect(result.output).toContain("- Topic 5");
      expect(result.output).not.toContain("- Topic 6");
      expect(result.data).toEqual({ query: "test query", resultCount: 6 });
    });

    it("skips topics without Text property", async () => {
      mockFetch.mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          RelatedTopics: [
            { Text: "Valid" },
            { Name: "No text field" },
          ],
        }),
      });

      const result = await webSearch.execute({ query: "test" }, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain("- Valid");
      expect(result.output).not.toContain("No text field");
    });

    it("returns fallback message when no results", async () => {
      mockFetch.mockResolvedValue({
        json: vi.fn().mockResolvedValue({}),
      });

      const result = await webSearch.execute({ query: "obscure query" }, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain('No immediate results found for "obscure query"');
    });

    it("returns fallback when AbstractText is empty and no topics", async () => {
      mockFetch.mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          AbstractText: "",
          RelatedTopics: [],
        }),
      });

      const result = await webSearch.execute({ query: "nothing" }, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain("No immediate results found");
    });

    it("handles fetch error (Error instance)", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await webSearch.execute({ query: "test" }, ctx);

      expect(result.success).toBe(false);
      expect(result.output).toContain("Search failed: Network error");
    });

    it("handles fetch error (non-Error)", async () => {
      mockFetch.mockRejectedValue("string error");

      const result = await webSearch.execute({ query: "test" }, ctx);

      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown error");
    });

    it("encodes query in URL", async () => {
      mockFetch.mockResolvedValue({
        json: vi.fn().mockResolvedValue({}),
      });

      await webSearch.execute({ query: "hello world & stuff" }, ctx);

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain("hello%20world%20%26%20stuff");
    });
  });

  // ── fetchUrl ────────────────────────────────────────────────────────

  describe("fetchUrl", () => {
    it("has correct metadata", () => {
      expect(fetchUrl.id).toBe("fetch_url");
      expect(fetchUrl.category).toBe("web");
    });

    it("fetches and cleans HTML content", async () => {
      const html =
        '<html><script>alert("xss")</script><style>body{}</style><body><p>Hello World</p></body></html>';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue("text/html; charset=utf-8") },
        text: vi.fn().mockResolvedValue(html),
      });

      const result = await fetchUrl.execute(
        { url: "https://example.com" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Hello World");
      expect(result.output).not.toContain("<script>");
      expect(result.output).not.toContain("<style>");
      expect(result.output).not.toContain("alert");
    });

    it("returns text/plain content", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue("text/plain") },
        text: vi.fn().mockResolvedValue("plain text content"),
      });

      const result = await fetchUrl.execute(
        { url: "https://example.com/file.txt" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("plain text content");
    });

    it("returns binary content message for non-text content types", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue("application/pdf") },
      });

      const result = await fetchUrl.execute(
        { url: "https://example.com/doc.pdf" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("binary content not shown");
      expect(result.output).toContain("application/pdf");
      expect(result.data).toEqual({
        url: "https://example.com/doc.pdf",
        contentType: "application/pdf",
      });
    });

    it("returns empty content type as binary", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue("") },
      });

      const result = await fetchUrl.execute(
        { url: "https://example.com/unknown" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("binary content not shown");
    });

    it("returns null content type as binary", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
      });

      const result = await fetchUrl.execute(
        { url: "https://example.com/unknown" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("binary content not shown");
    });

    it("returns error for non-ok HTTP response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await fetchUrl.execute(
        { url: "https://example.com/missing" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("HTTP 404");
    });

    it("handles fetch error (Error instance)", async () => {
      mockFetch.mockRejectedValue(new Error("Timeout"));

      const result = await fetchUrl.execute(
        { url: "https://example.com" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to fetch URL: Timeout");
    });

    it("handles fetch error (non-Error)", async () => {
      mockFetch.mockRejectedValue("network down");

      const result = await fetchUrl.execute(
        { url: "https://example.com" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown error");
    });

    it("truncates content to 5000 characters", async () => {
      const longText = "A".repeat(10000);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue("text/plain") },
        text: vi.fn().mockResolvedValue(longText),
      });

      const result = await fetchUrl.execute(
        { url: "https://example.com" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ url: "https://example.com", length: 5000 });
    });

    it("returns 'Page content is empty.' for empty cleaned content", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue("text/html") },
        text: vi.fn().mockResolvedValue("<html><body></body></html>"),
      });

      const result = await fetchUrl.execute(
        { url: "https://example.com/empty" },
        ctx
      );

      expect(result.success).toBe(true);
      // After stripping tags and trimming, content should be empty
      // The actual behavior: "<html><body></body></html>" → " " after tag removal → "" after trim
      expect(result.output).toBe("Page content is empty.");
    });

    it("sends correct User-Agent header and uses AbortSignal.timeout", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue("text/plain") },
        text: vi.fn().mockResolvedValue("ok"),
      });

      await fetchUrl.execute({ url: "https://example.com" }, ctx);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://example.com");
      expect(options.headers["User-Agent"]).toBe("OpenAssistant/0.1");
      expect(options.signal).toBeDefined();
    });

    describe("env var overrides", () => {
      afterEach(() => {
        delete process.env.FETCH_TIMEOUT_MS;
        delete process.env.USER_AGENT;
        delete process.env.MAX_CONTENT_LENGTH;
      });

      it("uses FETCH_TIMEOUT_MS env var when set", async () => {
        process.env.FETCH_TIMEOUT_MS = "5000";
        const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: { get: vi.fn().mockReturnValue("text/plain") },
          text: vi.fn().mockResolvedValue("ok"),
        });

        await fetchUrl.execute({ url: "https://example.com" }, ctx);

        expect(timeoutSpy).toHaveBeenCalledWith(5000);
        timeoutSpy.mockRestore();
      });

      it("uses USER_AGENT env var when set", async () => {
        process.env.USER_AGENT = "CustomAgent/1.0";
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: { get: vi.fn().mockReturnValue("text/plain") },
          text: vi.fn().mockResolvedValue("ok"),
        });

        await fetchUrl.execute({ url: "https://example.com" }, ctx);

        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers["User-Agent"]).toBe("CustomAgent/1.0");
      });

      it("uses MAX_CONTENT_LENGTH env var when set", async () => {
        process.env.MAX_CONTENT_LENGTH = "100";
        const longText = "A".repeat(500);
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: { get: vi.fn().mockReturnValue("text/plain") },
          text: vi.fn().mockResolvedValue(longText),
        });

        const result = await fetchUrl.execute({ url: "https://example.com" }, ctx);

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ url: "https://example.com", length: 100 });
      });

      it("uses default values when env vars are not set", async () => {
        const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          headers: { get: vi.fn().mockReturnValue("text/plain") },
          text: vi.fn().mockResolvedValue("ok"),
        });

        await fetchUrl.execute({ url: "https://example.com" }, ctx);

        expect(timeoutSpy).toHaveBeenCalledWith(10000);
        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers["User-Agent"]).toBe("OpenAssistant/0.1");
        timeoutSpy.mockRestore();
      });
    });
  });
});
