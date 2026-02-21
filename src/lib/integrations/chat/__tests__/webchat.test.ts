import { WebChatInstance, webchatIntegration } from "@/lib/integrations/chat/webchat";

describe("WebChatInstance", () => {
  let instance: WebChatInstance;

  beforeEach(() => {
    instance = new WebChatInstance(webchatIntegration, { enabled: true });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(webchatIntegration.id).toBe("webchat");
      expect(webchatIntegration.category).toBe("chat");
      expect(webchatIntegration.skills).toEqual([]);
    });
  });

  describe("connect", () => {
    it("should set status to connected", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
    });
  });

  describe("disconnect", () => {
    it("should set status to disconnected", async () => {
      await instance.connect();
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill", () => {
    it("should return always available for any skill", async () => {
      await instance.connect();
      const result = await instance.executeSkill("any_skill", {});
      // The definition has no skills so executeSkill base class will say "not found"
      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
    });
  });

  describe("handleSkill", () => {
    it("should return WebChat is always available", async () => {
      await instance.connect();
      const result = await (instance as any).handleSkill("any_skill", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("WebChat is always available");
    });
  });
});
