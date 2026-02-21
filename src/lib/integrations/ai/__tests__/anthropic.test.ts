const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { AnthropicInstance, anthropicIntegration } from "@/lib/integrations/ai/anthropic";

describe("AnthropicInstance", () => {
  let instance: AnthropicInstance;

  beforeEach(() => {
    instance = new AnthropicInstance(anthropicIntegration, { apiKey: "sk-ant-test" });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(anthropicIntegration.id).toBe("anthropic");
      expect(anthropicIntegration.category).toBe("ai");
    });
  });

  describe("connect", () => {
    it("should connect with valid key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "msg_123" }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should not connect if id is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      await instance.connect();
      // status remains disconnected since no id
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "msg_1" }),
      });
      await instance.connect();
    });

    it("should complete with default model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: "Hello!" }] }),
      });
      const result = await instance.executeSkill("anthropic_complete", { prompt: "Hi" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("Hello!");
    });

    it("should complete with custom model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: "Hey" }] }),
      });
      await instance.executeSkill("anthropic_complete", { prompt: "Hi", model: "claude-opus-4-5-20250929" });
      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.model).toBe("claude-opus-4-5-20250929");
    });

    it("should handle empty content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: "" }] }),
      });
      const result = await instance.executeSkill("anthropic_complete", { prompt: "Hi" });
      expect(result.output).toBe("");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("anthropic_unknown", {});
      expect(result.success).toBe(false);
    });
  });

  describe("disconnect", () => {
    it("should set status to disconnected", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "msg_1" }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("handleSkill default branch", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "msg_1" }),
      });
      await instance.connect();
    });

    it("should return error for unhandled skill id", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
