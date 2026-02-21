import { NostrInstance, nostrIntegration } from "@/lib/integrations/chat/nostr";

describe("NostrInstance", () => {
  let instance: NostrInstance;

  beforeEach(() => {
    instance = new NostrInstance(nostrIntegration, {
      privateKey: "nsec1234",
      relays: "wss://relay.damus.io",
    });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(nostrIntegration.id).toBe("nostr");
      expect(nostrIntegration.category).toBe("chat");
      expect(nostrIntegration.skills.length).toBe(1);
    });
  });

  describe("connect", () => {
    it("should connect with valid private key", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if private key is empty", async () => {
      const noKey = new NostrInstance(nostrIntegration, {
        privateKey: "",
        relays: "wss://relay.damus.io",
      });
      await expect(noKey.connect()).rejects.toThrow("Private key is required");
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

    it("should send a DM", async () => {
      const result = await instance.executeSkill("nostr_send_dm", {
        pubkey: "npub1234567890abcdef",
        message: "hello encrypted",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Encrypted DM sent");
      expect(result.output).toContain("npub12345678");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("nostr_unknown", {});
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
