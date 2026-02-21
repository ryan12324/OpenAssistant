import { PeekabooInstance, peekabooIntegration } from "@/lib/integrations/media/peekaboo";

describe("PeekabooInstance", () => {
  let instance: PeekabooInstance;

  beforeEach(() => {
    instance = new PeekabooInstance(peekabooIntegration, { enabled: true });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(peekabooIntegration.id).toBe("peekaboo");
      expect(peekabooIntegration.category).toBe("media");
      expect(peekabooIntegration.skills.length).toBe(2);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect and disconnect", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      await instance.connect();
    });

    it("should take a screenshot", async () => {
      const result = await instance.executeSkill("peekaboo_screenshot", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Screenshot captured");
    });

    it("should describe screen", async () => {
      const result = await instance.executeSkill("peekaboo_describe_screen", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Screen analysis complete");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("peekaboo_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
