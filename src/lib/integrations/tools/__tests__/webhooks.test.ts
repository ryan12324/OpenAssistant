const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

import { WebhooksInstance, webhooksIntegration } from "@/lib/integrations/tools/webhooks";

describe("WebhooksInstance", () => {
  let instance: WebhooksInstance;

  beforeEach(() => {
    instance = new WebhooksInstance(webhooksIntegration, { secret: "s3cret" });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(webhooksIntegration.id).toBe("webhooks");
      expect(webhooksIntegration.category).toBe("tools");
      expect(webhooksIntegration.skills.length).toBe(1);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect and disconnect", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      await instance.connect();
    });

    it("should send a webhook with default POST method", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });
      const result = await instance.executeSkill("webhook_send", {
        url: "https://hook.example.com",
        body: '{"event":"test"}',
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("POST");
      expect(result.output).toContain("200");
    });

    it("should send a webhook with custom method and headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: () => Promise.resolve("Created"),
      });
      const result = await instance.executeSkill("webhook_send", {
        url: "https://hook.example.com",
        method: "PUT",
        headers: '{"X-Custom":"val"}',
        body: '{}',
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("PUT");
      expect(result.output).toContain("201");
    });

    it("should handle non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server Error"),
      });
      const result = await instance.executeSkill("webhook_send", {
        url: "https://hook.example.com",
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain("500");
    });

    it("should handle fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));
      const result = await instance.executeSkill("webhook_send", {
        url: "https://fail.com",
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Connection refused");
    });

    it("should handle non-Error fetch error", async () => {
      mockFetch.mockRejectedValueOnce("timeout");
      const result = await instance.executeSkill("webhook_send", {
        url: "https://fail.com",
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown error");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("webhooks_unknown", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });

    describe("env var overrides", () => {
      afterEach(() => {
        delete process.env.FETCH_TIMEOUT_MS;
      });

      it("should use FETCH_TIMEOUT_MS env var when set", async () => {
        process.env.FETCH_TIMEOUT_MS = "7000";
        const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve("OK"),
        });

        await instance.executeSkill("webhook_send", { url: "https://hook.example.com" });

        expect(timeoutSpy).toHaveBeenCalledWith(7000);
        timeoutSpy.mockRestore();
      });

      it("should use default timeout when env var is not set", async () => {
        const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve("OK"),
        });

        await instance.executeSkill("webhook_send", { url: "https://hook.example.com" });

        expect(timeoutSpy).toHaveBeenCalledWith(10000);
        timeoutSpy.mockRestore();
      });
    });
  });
});
