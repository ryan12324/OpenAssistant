import { AppleRemindersInstance, appleRemindersIntegration } from "@/lib/integrations/productivity/apple-reminders";

describe("AppleRemindersInstance", () => {
  let instance: AppleRemindersInstance;

  beforeEach(() => {
    instance = new AppleRemindersInstance(appleRemindersIntegration, { enabled: true });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(appleRemindersIntegration.id).toBe("apple-reminders");
      expect(appleRemindersIntegration.category).toBe("productivity");
      expect(appleRemindersIntegration.skills.length).toBe(3);
    });
  });

  describe("connect", () => {
    it("should throw on non-darwin", async () => {
      const orig = process.platform;
      Object.defineProperty(process, "platform", { value: "linux", writable: true });
      await expect(instance.connect()).rejects.toThrow("Apple Reminders requires macOS");
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

    it("should create a reminder with due date", async () => {
      const result = await instance.executeSkill("reminders_create", {
        title: "Buy milk",
        due_date: "2024-12-25",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Buy milk");
      expect(result.output).toContain("2024-12-25");
    });

    it("should create a reminder without due date", async () => {
      const result = await instance.executeSkill("reminders_create", { title: "Buy milk" });
      expect(result.success).toBe(true);
      expect(result.output).not.toContain("due:");
    });

    it("should list reminders with custom list", async () => {
      const result = await instance.executeSkill("reminders_list", { list: "Shopping" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Shopping");
    });

    it("should list reminders with default list", async () => {
      const result = await instance.executeSkill("reminders_list", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Reminders");
    });

    it("should complete a reminder", async () => {
      const result = await instance.executeSkill("reminders_complete", { title: "Buy milk" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("complete");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("reminders_unknown", {});
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
