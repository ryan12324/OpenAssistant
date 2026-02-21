import { iMessageInstance, imessageIntegration } from "@/lib/integrations/chat/imessage";

describe("iMessageInstance", () => {
  let instance: iMessageInstance;

  beforeEach(() => {
    instance = new iMessageInstance(imessageIntegration, { mode: "applescript" });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(imessageIntegration.id).toBe("imessage");
      expect(imessageIntegration.category).toBe("chat");
      expect(imessageIntegration.skills.length).toBe(1);
    });
  });

  describe("connect", () => {
    it("should throw on non-darwin platform", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux", writable: true });

      await expect(instance.connect()).rejects.toThrow("iMessage integration requires macOS");

      Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
    });

    it("should connect on darwin platform", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin", writable: true });

      await instance.connect();
      expect(instance.status).toBe("connected");

      Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
    });
  });

  describe("disconnect", () => {
    it("should set status to disconnected", async () => {
      instance.status = "connected";
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill", () => {
    beforeEach(() => {
      instance.status = "connected";
    });

    it("should send an iMessage", async () => {
      const result = await instance.executeSkill("imessage_send", {
        recipient: "+14155551234",
        message: "hello",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("+14155551234");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("imessage_unknown", {});
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
