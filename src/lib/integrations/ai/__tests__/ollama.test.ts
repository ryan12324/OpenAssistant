const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { OllamaInstance, ollamaIntegration } from "@/lib/integrations/ai/ollama";

describe("OllamaInstance", () => {
  let instance: OllamaInstance;

  beforeEach(() => {
    instance = new OllamaInstance(ollamaIntegration, { baseUrl: "http://localhost:11434", model: "llama3.1" });
    mockFetch.mockReset();
  });

  describe("connect", () => {
    it("should connect with valid server", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [] }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if models is missing", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await expect(instance.connect()).rejects.toThrow("Cannot connect to Ollama");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [] }) });
      await instance.connect();
    });

    it("should complete", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: "Hello" }) });
      const result = await instance.executeSkill("ollama_complete", { prompt: "Hi" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Hello");
    });

    it("should complete with model override", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ response: "Hey" }) });
      await instance.executeSkill("ollama_complete", { prompt: "Hi", model: "mistral" });
      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.model).toBe("mistral");
    });

    it("should list models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [{ name: "llama3.1", size: 4e9 }] }),
      });
      const result = await instance.executeSkill("ollama_list_models", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("llama3.1");
      expect(result.output).toContain("4.0GB");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("ollama_unknown", {});
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [] }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });
});
