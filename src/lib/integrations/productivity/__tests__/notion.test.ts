const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { NotionInstance, notionIntegration } from "@/lib/integrations/productivity/notion";

describe("NotionInstance", () => {
  let instance: NotionInstance;

  beforeEach(() => {
    instance = new NotionInstance(notionIntegration, { apiKey: "ntn_test" });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(notionIntegration.id).toBe("notion");
      expect(notionIntegration.category).toBe("productivity");
      expect(notionIntegration.skills.length).toBe(3);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect by verifying user", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "u1" }) });
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "u1" }) });
      await instance.connect();
    });

    it("should search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: "p1", object: "page" }] }),
      });
      const result = await instance.executeSkill("notion_search", { query: "test" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("1 results");
    });

    it("should create a page with content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "p1", url: "https://notion.so/p1" }),
      });
      const result = await instance.executeSkill("notion_create_page", {
        database_id: "db1",
        title: "New Page",
        content: "Some content",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("https://notion.so/p1");
    });

    it("should create a page without content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "p2", url: "https://notion.so/p2" }),
      });
      const result = await instance.executeSkill("notion_create_page", {
        database_id: "db1",
        title: "Empty Page",
      });
      expect(result.success).toBe(true);
    });

    it("should query database", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{}, {}, {}] }),
      });
      const result = await instance.executeSkill("notion_query_database", { database_id: "db1" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("3 entries");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("notion_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
