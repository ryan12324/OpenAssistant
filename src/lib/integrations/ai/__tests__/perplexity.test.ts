const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { PerplexityInstance, perplexityIntegration } from "@/lib/integrations/ai/perplexity";

describe("PerplexityInstance", () => {
  let instance: PerplexityInstance;

  beforeEach(() => {
    instance = new PerplexityInstance(perplexityIntegration, { apiKey: "pk" });
    mockFetch.mockReset();
  });

  describe("connect / disconnect", () => {
    it("should connect immediately", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should disconnect", async () => {
      await instance.connect();
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      await instance.connect();
    });

    it("should search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "Answer with citations" } }] }),
      });
      const result = await instance.executeSkill("perplexity_search", { query: "what is AI" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Answer with citations");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("perplexity_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
