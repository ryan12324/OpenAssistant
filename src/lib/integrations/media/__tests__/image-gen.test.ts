const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { ImageGenInstance, imageGenIntegration } from "@/lib/integrations/media/image-gen";

describe("ImageGenInstance", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(imageGenIntegration.id).toBe("image-gen");
      expect(imageGenIntegration.category).toBe("media");
      expect(imageGenIntegration.skills.length).toBe(1);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect and disconnect", async () => {
      const inst = new ImageGenInstance(imageGenIntegration, { provider: "dalle", apiKey: "sk-test" });
      await inst.connect();
      expect(inst.status).toBe("connected");
      await inst.disconnect();
      expect(inst.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    it("should generate an image with dalle provider", async () => {
      const inst = new ImageGenInstance(imageGenIntegration, { provider: "dalle", apiKey: "sk-test" });
      await inst.connect();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ url: "https://img.example.com/1.png" }] }),
      });
      const result = await inst.executeSkill("image_generate", { prompt: "A cat" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("https://img.example.com/1.png");
    });

    it("should generate with custom size", async () => {
      const inst = new ImageGenInstance(imageGenIntegration, { provider: "dalle", apiKey: "sk-test" });
      await inst.connect();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ url: "url" }] }),
      });
      await inst.executeSkill("image_generate", { prompt: "A cat", size: "1792x1024" });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe("1792x1024");
    });

    it("should return generic message for non-dalle provider", async () => {
      const inst = new ImageGenInstance(imageGenIntegration, { provider: "stability", apiKey: "key" });
      await inst.connect();
      const result = await inst.executeSkill("image_generate", { prompt: "A dog" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Image generation requested");
    });

    it("should return error for unknown skill", async () => {
      const inst = new ImageGenInstance(imageGenIntegration, { provider: "dalle", apiKey: "k" });
      await inst.connect();
      const result = await inst.executeSkill("image_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const inst = new ImageGenInstance(imageGenIntegration, { provider: "dalle", apiKey: "k" });
      await inst.connect();
      const result = await (inst as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
