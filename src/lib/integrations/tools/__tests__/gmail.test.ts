const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

import { GmailInstance, gmailIntegration } from "@/lib/integrations/tools/gmail";

describe("GmailInstance", () => {
  let instance: GmailInstance;
  const config = { clientId: "cid", clientSecret: "cs", refreshToken: "rt" };

  beforeEach(() => {
    instance = new GmailInstance(gmailIntegration, config);
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(gmailIntegration.id).toBe("gmail");
      expect(gmailIntegration.category).toBe("tools");
      expect(gmailIntegration.skills.length).toBe(3);
    });
  });

  describe("connect", () => {
    it("should exchange refresh token for access token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "at-123" }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });
  });

  describe("disconnect", () => {
    it("should clear access token and disconnect", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "at-123" }),
      });
      await instance.connect();
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "at-123" }),
      });
      await instance.connect();
    });

    it("should read inbox with default params", async () => {
      // List messages
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: "m1" }] }),
      });
      // Get message detail
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            payload: {
              headers: [
                { name: "Subject", value: "Test Subject" },
                { name: "From", value: "sender@test.com" },
              ],
            },
            snippet: "This is a test email",
          }),
      });

      const result = await instance.executeSkill("gmail_read_inbox", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Test Subject");
      expect(result.output).toContain("sender@test.com");
    });

    it("should read inbox with custom count and query", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [] }),
      });

      const result = await instance.executeSkill("gmail_read_inbox", { count: 3, query: "from:boss" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("No emails found");
    });

    it("should handle email without Subject and From headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: "m1" }] }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ payload: { headers: [] }, snippet: "no subject" }),
      });
      const result = await instance.executeSkill("gmail_read_inbox", {});
      expect(result.output).toContain("(no subject)");
    });

    it("should handle null messages list", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      const result = await instance.executeSkill("gmail_read_inbox", {});
      expect(result.success).toBe(true);
      expect(result.output).toBe("No emails found");
    });

    it("should send an email", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "msg-1" }),
      });
      const result = await instance.executeSkill("gmail_send", {
        to: "recipient@test.com",
        subject: "Hello",
        body: "<b>Hi</b>",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Email sent to recipient@test.com");
    });

    it("should search emails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [], resultSizeEstimate: 42 }),
      });
      const result = await instance.executeSkill("gmail_search", { query: "important" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("42 emails");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("gmail_unknown", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
