const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

import { BrowserInstance, browserIntegration } from "@/lib/integrations/tools/browser";

describe("BrowserInstance", () => {
  let instance: BrowserInstance;

  beforeEach(() => {
    instance = new BrowserInstance(browserIntegration, { headless: true });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(browserIntegration.id).toBe("browser");
      expect(browserIntegration.category).toBe("tools");
      expect(browserIntegration.skills.length).toBe(4);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect and disconnect", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      await instance.connect();
    });

    it("should navigate to a URL", async () => {
      const result = await instance.executeSkill("browser_navigate", { url: "https://example.com" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Navigated to https://example.com");
    });

    it("should take a screenshot", async () => {
      const result = await instance.executeSkill("browser_screenshot", { url: "https://example.com" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Screenshot captured");
      expect(result.output).toContain("https://example.com");
    });

    it("should take a screenshot of current page when no url", async () => {
      const result = await instance.executeSkill("browser_screenshot", {});
      expect(result.success).toBe(true);
      expect(result.output).toBe("Screenshot captured");
    });

    it("should extract text from a page", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("<html><body><p>Hello World</p></body></html>"),
      });
      const result = await instance.executeSkill("browser_extract_text", { url: "https://example.com" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Hello World");
    });

    it("should strip script and style tags from extracted text", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            "<html><script>var x=1;</script><style>.a{}</style><body>Clean Text</body></html>"
          ),
      });
      const result = await instance.executeSkill("browser_extract_text", { url: "https://x.com" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Clean Text");
      expect(result.output).not.toContain("var x");
      expect(result.output).not.toContain(".a{}");
    });

    it("should handle extract text failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await instance.executeSkill("browser_extract_text", { url: "https://fail.com" });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Network error");
    });

    it("should handle extract text non-Error failure", async () => {
      mockFetch.mockRejectedValueOnce("string error");
      const result = await instance.executeSkill("browser_extract_text", { url: "https://fail.com" });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown error");
    });

    it("should fill a form", async () => {
      const result = await instance.executeSkill("browser_fill_form", {
        url: "https://example.com/form",
        fields: '{"#name":"John"}',
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Form filled");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("browser_unknown", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
