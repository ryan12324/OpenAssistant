const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { MistralInstance, mistralIntegration } from "@/lib/integrations/ai/mistral";

describe("MistralInstance", () => {
  let instance: MistralInstance;

  beforeEach(() => {
    instance = new MistralInstance(mistralIntegration, { apiKey: "mk" });
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
        json: () => Promise.resolve({ choices: [{ message: { content: "Hello" } }] }),
      });
      const result = await instance.executeSkill("mistral_complete", { prompt: "Hi" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Hello");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("mistral_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
