const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { OpenAIInstance, openaiIntegration } from "@/lib/integrations/ai/openai";

describe("OpenAIInstance", () => {
  let instance: OpenAIInstance;

  beforeEach(() => {
    instance = new OpenAIInstance(openaiIntegration, { apiKey: "sk-test" });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(openaiIntegration.id).toBe("openai");
      expect(openaiIntegration.category).toBe("ai");
    });
  });

  describe("connect", () => {
    it("should connect with valid API key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "gpt-4o" }] }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if data is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      await expect(instance.connect()).rejects.toThrow("Invalid API key");
    });

    it("should use custom baseUrl", async () => {
      const inst = new OpenAIInstance(openaiIntegration, { apiKey: "sk-test", baseUrl: "https://custom.api.com/v1" });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
      await inst.connect();
      expect(mockFetch).toHaveBeenCalledWith("https://custom.api.com/v1/models", expect.anything());
    });
  });

  describe("disconnect", () => {
    it("should disconnect", async () => {
      instance.status = "connected";
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
      await instance.connect();
    });

    it("should complete with default model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "Hello!" } }] }),
      });
      const result = await instance.executeSkill("openai_complete", { prompt: "Hi" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Hello!");
    });

    it("should complete with custom model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "Response" } }] }),
      });
      await instance.executeSkill("openai_complete", { prompt: "Hi", model: "o1" });
      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.model).toBe("o1");
    });

    it("should handle empty choices", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "" } }] }),
      });
      const result = await instance.executeSkill("openai_complete", { prompt: "Hi" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("openai_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
