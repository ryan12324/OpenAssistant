const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

import { BlueBubblesInstance, blueBubblesIntegration } from "@/lib/integrations/chat/bluebubbles";

describe("BlueBubblesInstance", () => {
  let instance: BlueBubblesInstance;
  const config = { serverUrl: "http://localhost:1234", password: "secret" };

  beforeEach(() => {
    instance = new BlueBubblesInstance(blueBubblesIntegration, config);
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(blueBubblesIntegration.id).toBe("bluebubbles");
      expect(blueBubblesIntegration.category).toBe("chat");
      expect(blueBubblesIntegration.skills.length).toBe(2);
    });
  });

  describe("connect", () => {
    it("should connect with valid server", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 200 }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if status is not 200", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 500 }),
      });
      await expect(instance.connect()).rejects.toThrow("Failed to connect");
    });
  });

  describe("disconnect", () => {
    it("should set status to disconnected", async () => {
      instance.status = "connected";
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 200 }),
      });
      await instance.connect();
    });

    it("should send a message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      const result = await instance.executeSkill("bluebubbles_send", {
        chat_guid: "guid-123",
        message: "hello",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Message sent via BlueBubbles");
    });

    it("should list chats", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { guid: "g1", displayName: "John" },
              { guid: "g2", displayName: "" },
            ],
          }),
      });
      const result = await instance.executeSkill("bluebubbles_list_chats", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("John");
      expect(result.output).toContain("Unknown");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("bluebubbles_unknown", {});
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
