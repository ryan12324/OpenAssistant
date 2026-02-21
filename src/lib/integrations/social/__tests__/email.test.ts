import { EmailInstance, emailIntegration } from "@/lib/integrations/social/email";

describe("EmailInstance", () => {
  let instance: EmailInstance;

  beforeEach(() => {
    instance = new EmailInstance(emailIntegration, {
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: "user@gmail.com",
      smtpPassword: "pass",
    });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(emailIntegration.id).toBe("email");
      expect(emailIntegration.category).toBe("social");
      expect(emailIntegration.skills.length).toBe(2);
    });
  });

  describe("connect", () => {
    it("should connect with valid config", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if smtpHost is missing", async () => {
      const inst = new EmailInstance(emailIntegration, {
        smtpHost: "",
        smtpPort: 587,
        smtpUser: "user@gmail.com",
        smtpPassword: "pass",
      });
      await expect(inst.connect()).rejects.toThrow("SMTP configuration required");
    });

    it("should throw if smtpUser is missing", async () => {
      const inst = new EmailInstance(emailIntegration, {
        smtpHost: "smtp.gmail.com",
        smtpPort: 587,
        smtpUser: "",
        smtpPassword: "pass",
      });
      await expect(inst.connect()).rejects.toThrow("SMTP configuration required");
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

    it("should send an email", async () => {
      const result = await instance.executeSkill("email_send", {
        to: "recipient@test.com",
        subject: "Hello",
        body: "World",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("recipient@test.com");
      expect(result.output).toContain("Hello");
    });

    it("should read inbox with default count", async () => {
      const result = await instance.executeSkill("email_read_inbox", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("5 most recent");
    });

    it("should read inbox with custom count", async () => {
      const result = await instance.executeSkill("email_read_inbox", { count: 10 });
      expect(result.success).toBe(true);
      expect(result.output).toContain("10 most recent");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("email_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
