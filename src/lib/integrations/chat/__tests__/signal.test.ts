import { SignalInstance, signalIntegration } from "@/lib/integrations/chat/signal";

describe("SignalInstance", () => {
  let instance: SignalInstance;

  beforeEach(() => {
    instance = new SignalInstance(signalIntegration, {
      signalCliPath: "signal-cli",
      phoneNumber: "+14155551234",
    });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(signalIntegration.id).toBe("signal");
      expect(signalIntegration.category).toBe("chat");
      expect(signalIntegration.skills.length).toBe(1);
    });
  });

  describe("connect", () => {
    it("should connect with valid phone number", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if phone number is empty", async () => {
      const noPhone = new SignalInstance(signalIntegration, {
        signalCliPath: "signal-cli",
        phoneNumber: "",
      });
      await expect(noPhone.connect()).rejects.toThrow("Phone number is required");
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
    beforeEach(async () => {
      await instance.connect();
    });

    it("should send a message", async () => {
      const result = await instance.executeSkill("signal_send_message", {
        recipient: "+15551234567",
        message: "hello",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("+15551234567");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("signal_unknown", {});
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
