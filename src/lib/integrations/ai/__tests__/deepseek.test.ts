const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { DeepSeekInstance, deepseekIntegration } from "@/lib/integrations/ai/deepseek";

describe("DeepSeekInstance", () => {
  let instance: DeepSeekInstance;

  beforeEach(() => {
    instance = new DeepSeekInstance(deepseekIntegration, { apiKey: "dk" });
    mockFetch.mockReset();
  });

  describe("connect / disconnect", () => {
    it("should connect", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should disconnect", async () => {
      instance.status = "connected";
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await instance.connect();
    });

    it("should complete", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "Reply" } }] }),
      });
      const result = await instance.executeSkill("deepseek_complete", { prompt: "Hi" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Reply");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("deepseek_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
