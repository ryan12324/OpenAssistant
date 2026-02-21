const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { MiniMaxInstance, minimaxIntegration } from "@/lib/integrations/ai/minimax";

describe("MiniMaxInstance", () => {
  let instance: MiniMaxInstance;

  beforeEach(() => {
    instance = new MiniMaxInstance(minimaxIntegration, { apiKey: "mmk" });
    mockFetch.mockReset();
  });

  describe("connect", () => {
    it("should connect if choices present", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{}] }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should not set connected if no choices", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await instance.connect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{}] }) });
      await instance.connect();
    });

    it("should complete", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "Hi" } }] }),
      });
      const result = await instance.executeSkill("minimax_complete", { prompt: "Hello" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Hi");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("minimax_unknown", {});
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ choices: [{}] }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });
});
