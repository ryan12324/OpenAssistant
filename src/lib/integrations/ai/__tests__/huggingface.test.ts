const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { HuggingFaceInstance, huggingfaceIntegration } from "@/lib/integrations/ai/huggingface";

describe("HuggingFaceInstance", () => {
  let instance: HuggingFaceInstance;

  beforeEach(() => {
    instance = new HuggingFaceInstance(huggingfaceIntegration, { apiKey: "hf_test" });
    mockFetch.mockReset();
  });

  describe("connect", () => {
    it("should connect with valid token", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ username: "user" }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should not connect if username is missing", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await instance.connect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ username: "user" }) });
      await instance.connect();
    });

    it("should complete", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "HF Reply" } }] }),
      });
      const result = await instance.executeSkill("huggingface_complete", { prompt: "Hello" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("HF Reply");
    });

    it("should complete with model override", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "OK" } }] }),
      });
      await instance.executeSkill("huggingface_complete", { prompt: "Hi", model: "custom-model" });
      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.model).toBe("custom-model");
    });

    it("should list models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: "meta-llama/Llama-3.1-70B", likes: 1000 }]),
      });
      const result = await instance.executeSkill("huggingface_list_models", { query: "llama" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("meta-llama/Llama-3.1-70B");
      expect(result.output).toContain("1000 likes");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("huggingface_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });

  describe("disconnect", () => {
    it("should set status to disconnected", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ username: "user" }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });
});
