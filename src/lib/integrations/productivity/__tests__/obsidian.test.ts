const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { ObsidianInstance, obsidianIntegration } from "@/lib/integrations/productivity/obsidian";

describe("ObsidianInstance", () => {
  let instance: ObsidianInstance;
  const config = { apiUrl: "https://localhost:27124", apiKey: "key" };

  beforeEach(() => {
    instance = new ObsidianInstance(obsidianIntegration, config);
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(obsidianIntegration.id).toBe("obsidian");
      expect(obsidianIntegration.category).toBe("productivity");
      expect(obsidianIntegration.skills.length).toBe(4);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await instance.connect();
    });

    it("should search notes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ filename: "note.md", score: 0.95 }]),
      });
      const result = await instance.executeSkill("obsidian_search", { query: "test" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("note.md");
      expect(result.output).toContain("0.95");
    });

    it("should create a note", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      const result = await instance.executeSkill("obsidian_create_note", {
        path: "folder/note.md",
        content: "# Hello",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Note created");
    });

    it("should read a note", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("# My Note\nContent here"),
      });
      const result = await instance.executeSkill("obsidian_read_note", { path: "note.md" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("My Note");
    });

    it("should append to a note", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      const result = await instance.executeSkill("obsidian_append_note", {
        path: "note.md",
        content: "New content",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Content appended");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("obsidian_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
