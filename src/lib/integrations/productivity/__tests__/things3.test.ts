import { Things3Instance, things3Integration } from "@/lib/integrations/productivity/things3";

describe("Things3Instance", () => {
  let instance: Things3Instance;

  beforeEach(() => {
    instance = new Things3Instance(things3Integration, {});
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(things3Integration.id).toBe("things3");
      expect(things3Integration.category).toBe("productivity");
      expect(things3Integration.skills.length).toBe(2);
    });
  });

  describe("connect", () => {
    it("should throw on non-darwin", async () => {
      const orig = process.platform;
      Object.defineProperty(process, "platform", { value: "linux", writable: true });
      await expect(instance.connect()).rejects.toThrow("Things 3 requires macOS");
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

    it("should add a to-do with when", async () => {
      const result = await instance.executeSkill("things_add_todo", {
        title: "Task",
        when: "today",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Task");
      expect(result.output).toContain("today");
    });

    it("should add a to-do without when", async () => {
      const result = await instance.executeSkill("things_add_todo", { title: "Task" });
      expect(result.success).toBe(true);
      expect(result.output).not.toContain("(");
    });

    it("should add a project", async () => {
      const result = await instance.executeSkill("things_add_project", { title: "Project X" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Project X");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("things_unknown", {});
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
