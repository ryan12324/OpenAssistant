import { CronInstance, cronIntegration } from "@/lib/integrations/tools/cron";

describe("CronInstance", () => {
  let instance: CronInstance;

  beforeEach(() => {
    instance = new CronInstance(cronIntegration, { enabled: true });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(cronIntegration.id).toBe("cron");
      expect(cronIntegration.category).toBe("tools");
      expect(cronIntegration.skills.length).toBe(3);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect and set status", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should disconnect, clear tasks, and set status", async () => {
      await instance.connect();
      await instance.executeSkill("cron_schedule", {
        name: "test",
        expression: "* * * * *",
        task: "do something",
      });
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      await instance.connect();
    });

    it("should schedule a task", async () => {
      const result = await instance.executeSkill("cron_schedule", {
        name: "daily-report",
        expression: "0 9 * * *",
        task: "Generate daily report",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("daily-report");
      expect(result.output).toContain("0 9 * * *");
    });

    it("should list tasks when empty", async () => {
      const result = await instance.executeSkill("cron_list", {});
      expect(result.success).toBe(true);
      expect(result.output).toBe("No scheduled tasks");
    });

    it("should list tasks when non-empty", async () => {
      await instance.executeSkill("cron_schedule", {
        name: "task1",
        expression: "0 * * * *",
        task: "do stuff",
      });
      const result = await instance.executeSkill("cron_list", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("task1");
      expect(result.output).toContain("0 * * * *");
    });

    it("should delete a task", async () => {
      await instance.executeSkill("cron_schedule", {
        name: "task1",
        expression: "0 * * * *",
        task: "do stuff",
      });
      const result = await instance.executeSkill("cron_delete", { name: "task1" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("deleted");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("cron_unknown", {});
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
