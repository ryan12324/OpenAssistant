import { BearNotesInstance, bearNotesIntegration } from "@/lib/integrations/productivity/bear-notes";

describe("BearNotesInstance", () => {
  let instance: BearNotesInstance;

  beforeEach(() => {
    instance = new BearNotesInstance(bearNotesIntegration, {});
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(bearNotesIntegration.id).toBe("bear-notes");
      expect(bearNotesIntegration.category).toBe("productivity");
      expect(bearNotesIntegration.skills.length).toBe(2);
    });
  });

  describe("connect", () => {
    it("should throw on non-darwin", async () => {
      const orig = process.platform;
      Object.defineProperty(process, "platform", { value: "linux", writable: true });
      await expect(instance.connect()).rejects.toThrow("Bear Notes requires macOS");
      Object.defineProperty(process, "platform", { value: orig, writable: true });
    });

    it("should connect on darwin", async () => {
      const orig = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin", writable: true });
      await instance.connect();
      expect(instance.status).toBe("connected");
      Object.defineProperty(process, "platform", { value: orig, writable: true });
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(() => {
      instance.status = "connected";
    });

    it("should create a note with tags", async () => {
      const result = await instance.executeSkill("bear_create_note", {
        title: "My Note",
        text: "# Content",
        tags: "work,notes",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("My Note");
      expect(result.output).toContain("work,notes");
    });

    it("should create a note without tags", async () => {
      const result = await instance.executeSkill("bear_create_note", {
        title: "My Note",
        text: "Content",
      });
      expect(result.success).toBe(true);
      expect(result.output).not.toContain("with tags");
    });

    it("should search notes", async () => {
      const result = await instance.executeSkill("bear_search", { query: "meeting" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("meeting");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("bear_unknown", {});
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
      instance.status = "connected";
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });
});
