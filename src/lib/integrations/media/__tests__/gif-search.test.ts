const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { GifSearchInstance, gifSearchIntegration } from "@/lib/integrations/media/gif-search";

describe("GifSearchInstance", () => {
  let instance: GifSearchInstance;

  beforeEach(() => {
    instance = new GifSearchInstance(gifSearchIntegration, { apiKey: "tenor-key" });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(gifSearchIntegration.id).toBe("gif-search");
      expect(gifSearchIntegration.category).toBe("media");
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

    it("should search gifs with default limit", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { content_description: "Funny cat", media_formats: { gif: { url: "https://gif.com/1" } } },
            ],
          }),
      });
      const result = await instance.executeSkill("gif_search", { query: "cat" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Funny cat");
    });

    it("should search gifs with custom limit", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });
      const result = await instance.executeSkill("gif_search", { query: "cat", limit: 3 });
      expect(result.success).toBe(true);
      expect(result.output).toBe("No GIFs found");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("gif_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
