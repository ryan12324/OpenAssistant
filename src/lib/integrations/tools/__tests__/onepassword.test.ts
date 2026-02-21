import { OnePasswordInstance, onepasswordIntegration } from "@/lib/integrations/tools/onepassword";

describe("OnePasswordInstance", () => {
  let instance: OnePasswordInstance;

  beforeEach(() => {
    instance = new OnePasswordInstance(onepasswordIntegration, { serviceAccountToken: "tok-123" });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(onepasswordIntegration.id).toBe("1password");
      expect(onepasswordIntegration.category).toBe("tools");
      expect(onepasswordIntegration.skills.length).toBe(2);
    });
  });

  describe("connect", () => {
    it("should connect with valid token", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if token is empty", async () => {
      const noToken = new OnePasswordInstance(onepasswordIntegration, { serviceAccountToken: "" });
      await expect(noToken.connect()).rejects.toThrow("Service account token required");
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

    it("should get a secret", async () => {
      const result = await instance.executeSkill("1password_get_secret", {
        reference: "op://vault/item/field",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Secret retrieved");
    });

    it("should list vaults", async () => {
      const result = await instance.executeSkill("1password_list_vaults", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Vaults listed");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("1password_unknown", {});
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
