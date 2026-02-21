import { AppleNotesInstance, appleNotesIntegration } from "@/lib/integrations/productivity/apple-notes";

describe("AppleNotesInstance", () => {
  let instance: AppleNotesInstance;

  beforeEach(() => {
    instance = new AppleNotesInstance(appleNotesIntegration, { enabled: true });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(appleNotesIntegration.id).toBe("apple-notes");
      expect(appleNotesIntegration.category).toBe("productivity");
      expect(appleNotesIntegration.skills.length).toBe(2);
    });
  });

  describe("connect", () => {
    it("should throw on non-darwin platform", async () => {
      const orig = process.platform;
      Object.defineProperty(process, "platform", { value: "linux", writable: true });
      await expect(instance.connect()).rejects.toThrow("Apple Notes requires macOS");
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

    it("should create a note with folder", async () => {
      const result = await instance.executeSkill("apple_notes_create", {
        title: "My Note",
        body: "Content",
        folder: "Work",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("My Note");
    });

    it("should create a note without folder (default)", async () => {
      const result = await instance.executeSkill("apple_notes_create", {
        title: "My Note",
        body: "Content",
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({ folder: "Notes" }));
    });

    it("should search notes", async () => {
      const result = await instance.executeSkill("apple_notes_search", { query: "meeting" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("meeting");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("apple_notes_unknown", {});
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
