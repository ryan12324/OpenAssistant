const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { TrelloInstance, trelloIntegration } from "@/lib/integrations/productivity/trello";

describe("TrelloInstance", () => {
  let instance: TrelloInstance;

  beforeEach(() => {
    instance = new TrelloInstance(trelloIntegration, { apiKey: "ak", token: "tok" });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(trelloIntegration.id).toBe("trello");
      expect(trelloIntegration.category).toBe("productivity");
      expect(trelloIntegration.skills.length).toBe(3);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect by verifying member", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "m1" }) });
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "m1" }) });
      await instance.connect();
    });

    it("should list boards", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: "b1", name: "My Board" }]),
      });
      const result = await instance.executeSkill("trello_list_boards", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("My Board");
    });

    it("should create a card", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "c1", shortUrl: "https://trello.com/c/abc" }),
      });
      const result = await instance.executeSkill("trello_create_card", {
        list_id: "l1",
        name: "New Card",
        desc: "Description",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("https://trello.com/c/abc");
    });

    it("should move a card", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      const result = await instance.executeSkill("trello_move_card", { card_id: "c1", list_id: "l2" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("moved");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("trello_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
