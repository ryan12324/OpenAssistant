import { EightSleepInstance, eightSleepIntegration } from "@/lib/integrations/smart-home/eightsleep";

describe("EightSleepInstance", () => {
  let instance: EightSleepInstance;

  beforeEach(() => {
    instance = new EightSleepInstance(eightSleepIntegration, { email: "a@b.com", password: "pass" });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(eightSleepIntegration.id).toBe("8sleep");
      expect(eightSleepIntegration.category).toBe("smart-home");
      expect(eightSleepIntegration.skills.length).toBe(3);
    });
  });

  describe("connect", () => {
    it("should connect with valid credentials", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw with missing email", async () => {
      const inst = new EightSleepInstance(eightSleepIntegration, { email: "", password: "pass" });
      await expect(inst.connect()).rejects.toThrow("Credentials required");
    });

    it("should throw with missing password", async () => {
      const inst = new EightSleepInstance(eightSleepIntegration, { email: "a@b.com", password: "" });
      await expect(inst.connect()).rejects.toThrow("Credentials required");
    });
  });

  describe("disconnect", () => {
    it("should disconnect", async () => {
      await instance.connect();
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      await instance.connect();
    });

    it("should get bed status", async () => {
      const result = await instance.executeSkill("8sleep_status", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Bed status");
    });

    it("should set temperature", async () => {
      const result = await instance.executeSkill("8sleep_set_temp", { level: 5, side: "left" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("5");
      expect(result.output).toContain("left");
    });

    it("should get sleep data", async () => {
      const result = await instance.executeSkill("8sleep_sleep_data", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Sleep data");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("8sleep_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
