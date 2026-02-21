const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { LMStudioInstance, lmstudioIntegration } from "@/lib/integrations/ai/lmstudio";

describe("LMStudioInstance", () => {
  let instance: LMStudioInstance;

  beforeEach(() => {
    instance = new LMStudioInstance(lmstudioIntegration, { baseUrl: "http://localhost:1234" });
    mockFetch.mockReset();
  });

  describe("connect", () => {
    it("should connect with valid server", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if data is missing", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await expect(instance.connect()).rejects.toThrow("Cannot connect to LM Studio");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) });
      await instance.connect();
    });

    it("should complete", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "Local reply" } }] }),
      });
      const result = await instance.executeSkill("lmstudio_complete", { prompt: "Hello" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Local reply");
    });

    it("should list models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "model-1" }, { id: "model-2" }] }),
      });
      const result = await instance.executeSkill("lmstudio_list_models", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("model-1");
      expect(result.output).toContain("model-2");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("lmstudio_unknown", {});
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });
});
