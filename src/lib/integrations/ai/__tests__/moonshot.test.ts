const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { MoonshotInstance, moonshotIntegration } from "@/lib/integrations/ai/moonshot";

describe("MoonshotInstance", () => {
  let instance: MoonshotInstance;

  beforeEach(() => {
    instance = new MoonshotInstance(moonshotIntegration, { apiKey: "msk" });
    mockFetch.mockReset();
  });

  describe("connect", () => {
    it("should connect with valid key", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [{}] }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if models is missing", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await expect(instance.connect()).rejects.toThrow("Failed to fetch models list");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [{}] }) });
      await instance.connect();
    });

    it("should complete", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "Reply" } }] }),
      });
      const result = await instance.executeSkill("moonshot_complete", { prompt: "Hi" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Reply");
    });

    it("should handle empty choices", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      const result = await instance.executeSkill("moonshot_complete", { prompt: "Hi" });
      expect(result.success).toBe(false);
      expect(result.output).toContain("No response");
    });

    it("should handle missing choices", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      const result = await instance.executeSkill("moonshot_complete", { prompt: "Hi" });
      expect(result.success).toBe(false);
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("moonshot_unknown", {});
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ models: [{}] }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });
});
