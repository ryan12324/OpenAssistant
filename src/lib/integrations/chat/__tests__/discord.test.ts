const mockFetch = vi.hoisted(() => vi.fn());
const mockDownloadAndIngestFile = vi.hoisted(() => vi.fn());
const mockFormatFileResults = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/integrations/chat/file-handler", () => ({
  downloadAndIngestFile: mockDownloadAndIngestFile,
  formatFileResults: mockFormatFileResults,
}));

import { DiscordInstance, discordIntegration } from "@/lib/integrations/chat/discord";

describe("DiscordInstance", () => {
  let instance: DiscordInstance;
  const config = { botToken: "discord-token" };

  beforeEach(() => {
    instance = new DiscordInstance(discordIntegration, config);
    mockFetch.mockReset();
    mockDownloadAndIngestFile.mockReset();
    mockFormatFileResults.mockReset();
  });

  describe("definition", () => {
    it("should have correct id and category", () => {
      expect(discordIntegration.id).toBe("discord");
      expect(discordIntegration.category).toBe("chat");
      expect(discordIntegration.skills.length).toBe(3);
    });
  });

  describe("connect", () => {
    it("should connect with valid token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "123", username: "bot" }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if botToken is empty", async () => {
      const noToken = new DiscordInstance(discordIntegration, { botToken: "" });
      await expect(noToken.connect()).rejects.toThrow("Bot token is required");
    });

    it("should throw if user id is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ username: "bot" }),
      });
      await expect(instance.connect()).rejects.toThrow("Invalid bot token");
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
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "123", username: "bot" }),
      });
      await instance.connect();
    });

    it("should send a message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "msg1" }),
      });
      const result = await instance.executeSkill("discord_send_message", {
        channel_id: "ch1",
        content: "hello",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Message sent");
    });

    it("should list channels", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: "1", name: "general", type: 0 },
            { id: "2", name: "voice", type: 2 },
            { id: "3", name: "random", type: 0 },
          ]),
      });
      const result = await instance.executeSkill("discord_list_channels", { guild_id: "g1" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("#general");
      expect(result.output).toContain("#random");
      expect(result.output).not.toContain("#voice");
    });

    it("should download a file", async () => {
      mockDownloadAndIngestFile.mockResolvedValueOnce({ success: true, fileName: "file.pdf" });
      mockFormatFileResults.mockReturnValueOnce("Processed 1/1 files");

      const result = await instance.executeSkill("discord_download_file", {
        attachment_url: "https://cdn.discord.com/file.pdf",
        file_name: "file.pdf",
        user_id: "u1",
      });
      expect(result.success).toBe(true);
      expect(mockDownloadAndIngestFile).toHaveBeenCalledWith(
        expect.objectContaining({ source: "Discord" })
      );
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("discord_unknown", {});
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
