const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { GoogleAIInstance, googleIntegration } from "@/lib/integrations/ai/google";

describe("GoogleAIInstance", () => {
  let instance: GoogleAIInstance;

  beforeEach(() => {
    instance = new GoogleAIInstance(googleIntegration, { apiKey: "gk" });
    mockFetch.mockReset();
  });

  describe("connect", () => {
    it("should connect with valid key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ candidates: [{}] }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should not set connected if no candidates", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      await instance.connect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ candidates: [{}] }) });
      await instance.connect();
    });

    it("should complete with default model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] }),
      });
      const result = await instance.executeSkill("google_complete", { prompt: "Hi" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Hello");
    });

    it("should handle empty candidates", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ candidates: [] }),
      });
      const result = await instance.executeSkill("google_complete", { prompt: "Hi" });
      expect(result.output).toBe("");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("google_unknown", {});
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ candidates: [{}] }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });
});
