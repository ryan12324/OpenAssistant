const mockFetch = vi.hoisted(() => vi.fn());
const mockDownloadAndIngestFile = vi.hoisted(() => vi.fn());
const mockFormatFileResults = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/integrations/chat/file-handler", () => ({
  downloadAndIngestFile: mockDownloadAndIngestFile,
  formatFileResults: mockFormatFileResults,
}));

import { TelegramInstance, telegramIntegration } from "@/lib/integrations/chat/telegram";

describe("TelegramInstance", () => {
  let instance: TelegramInstance;
  const config = { botToken: "123:ABC" };

  beforeEach(() => {
    instance = new TelegramInstance(telegramIntegration, config);
    mockFetch.mockReset();
    mockDownloadAndIngestFile.mockReset();
    mockFormatFileResults.mockReset();
  });

  describe("telegramIntegration definition", () => {
    it("should have correct metadata", () => {
      expect(telegramIntegration.id).toBe("telegram");
      expect(telegramIntegration.category).toBe("chat");
      expect(telegramIntegration.supportsInbound).toBe(true);
      expect(telegramIntegration.supportsOutbound).toBe(true);
      expect(telegramIntegration.skills.length).toBe(3);
    });
  });

  describe("connect", () => {
    it("should verify bot token and set status to connected", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: { username: "testbot" } }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if bot token is empty", async () => {
      const noToken = new TelegramInstance(telegramIntegration, { botToken: "" });
      await expect(noToken.connect()).rejects.toThrow("Bot token is required");
    });

    it("should throw if getMe returns not ok", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: false }),
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
        json: () => Promise.resolve({ ok: true, result: { username: "testbot" } }),
      });
      await instance.connect();
    });

    it("should send a message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const result = await instance.executeSkill("telegram_send_message", {
        chat_id: "123",
        text: "hello",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Message sent");
    });

    it("should send a photo", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const result = await instance.executeSkill("telegram_send_photo", {
        chat_id: "123",
        photo_url: "https://example.com/photo.jpg",
        caption: "A photo",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Photo sent");
    });

    it("should download a file successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            result: { file_id: "fid", file_path: "photos/file.jpg" },
          }),
      });
      mockDownloadAndIngestFile.mockResolvedValueOnce({
        success: true,
        fileName: "file.jpg",
        contentLength: 100,
      });
      mockFormatFileResults.mockReturnValueOnce("file.jpg: 100 chars extracted");

      const result = await instance.executeSkill("telegram_download_file", {
        file_id: "fid",
        file_name: "file.jpg",
        user_id: "u1",
      });
      expect(result.success).toBe(true);
      expect(mockDownloadAndIngestFile).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining("file/bot123:ABC/photos/file.jpg"),
          fileName: "file.jpg",
          userId: "u1",
          source: "Telegram",
        })
      );
    });

    it("should handle file download when getFile returns not ok", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ ok: false, result: { file_id: "fid" } }),
      });

      const result = await instance.executeSkill("telegram_download_file", {
        file_id: "fid",
        file_name: "file.jpg",
        user_id: "u1",
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to get file info");
    });

    it("should handle file download when file_path is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ ok: true, result: { file_id: "fid" } }),
      });

      const result = await instance.executeSkill("telegram_download_file", {
        file_id: "fid",
        file_name: "file.jpg",
        user_id: "u1",
      });
      expect(result.success).toBe(false);
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("telegram_unknown", {});
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
