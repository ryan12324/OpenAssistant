const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { TwitterInstance, twitterIntegration } from "@/lib/integrations/social/twitter";

describe("TwitterInstance", () => {
  let instance: TwitterInstance;

  beforeEach(() => {
    instance = new TwitterInstance(twitterIntegration, { bearerToken: "bt" });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(twitterIntegration.id).toBe("twitter");
      expect(twitterIntegration.category).toBe("social");
      expect(twitterIntegration.skills.length).toBe(4);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: "1" } }) });
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: "1" } }) });
      await instance.connect();
    });

    it("should post a tweet", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "t1" } }),
      });
      const result = await instance.executeSkill("twitter_post", { text: "Hello Twitter" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("t1");
    });

    it("should search tweets", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { text: "Tweet 1", author_id: "a1" },
              { text: "Tweet 2", author_id: "a2" },
            ],
          }),
      });
      const result = await instance.executeSkill("twitter_search", { query: "test" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Tweet 1");
    });

    it("should search tweets with custom count", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      });
      const result = await instance.executeSkill("twitter_search", { query: "test", count: 5 });
      expect(result.success).toBe(true);
      expect(result.output).toContain("No tweets found");
    });

    it("should reply to a tweet", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: "r1" } }),
      });
      const result = await instance.executeSkill("twitter_reply", {
        tweet_id: "t1",
        text: "Reply here",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Reply posted");
    });

    it("should get timeline", async () => {
      const result = await instance.executeSkill("twitter_timeline", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Timeline retrieved");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("twitter_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
