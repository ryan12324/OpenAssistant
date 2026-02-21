const mockFetch = vi.hoisted(() => vi.fn());
const mockDownloadAndIngestFile = vi.hoisted(() => vi.fn());
const mockFormatFileResults = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/integrations/chat/file-handler", () => ({
  downloadAndIngestFile: mockDownloadAndIngestFile,
  formatFileResults: mockFormatFileResults,
}));

import { SlackInstance, slackIntegration } from "@/lib/integrations/chat/slack";

describe("SlackInstance", () => {
  let instance: SlackInstance;
  const config = { botToken: "xoxb-token" };

  beforeEach(() => {
    instance = new SlackInstance(slackIntegration, config);
    mockFetch.mockReset();
    mockDownloadAndIngestFile.mockReset();
    mockFormatFileResults.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(slackIntegration.id).toBe("slack");
      expect(slackIntegration.category).toBe("chat");
      expect(slackIntegration.skills.length).toBe(4);
    });
  });

  describe("connect", () => {
    it("should connect with valid token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if botToken is empty", async () => {
      const noToken = new SlackInstance(slackIntegration, { botToken: "" });
      await expect(noToken.connect()).rejects.toThrow("Bot token is required");
    });

    it("should throw if auth.test returns not ok", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: false, error: "invalid_auth" }),
      });
      await expect(instance.connect()).rejects.toThrow("Slack auth failed: invalid_auth");
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
        json: () => Promise.resolve({ ok: true }),
      });
      await instance.connect();
    });

    it("should send a message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: "123" }),
      });
      const result = await instance.executeSkill("slack_send_message", {
        channel: "#general",
        text: "hello",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Message posted");
    });

    it("should list channels", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            channels: [
              { id: "C1", name: "general" },
              { id: "C2", name: "random" },
            ],
          }),
      });
      const result = await instance.executeSkill("slack_list_channels", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("#general");
      expect(result.output).toContain("#random");
    });

    it("should set status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      const result = await instance.executeSkill("slack_set_status", {
        text: "Working",
        emoji: ":laptop:",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Status updated");
    });

    it("should set status with default emoji", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      const result = await instance.executeSkill("slack_set_status", { text: "Away" });
      expect(result.success).toBe(true);
    });

    it("should download a file successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            file: {
              id: "F1",
              name: "doc.pdf",
              mimetype: "application/pdf",
              size: 1024,
              url_private_download: "https://files.slack.com/doc.pdf",
            },
          }),
      });
      mockDownloadAndIngestFile.mockResolvedValueOnce({ success: true, fileName: "doc.pdf" });
      mockFormatFileResults.mockReturnValueOnce("doc.pdf: processed");

      const result = await instance.executeSkill("slack_download_file", {
        file_id: "F1",
        user_id: "u1",
      });
      expect(result.success).toBe(true);
      expect(mockDownloadAndIngestFile).toHaveBeenCalledWith(
        expect.objectContaining({ source: "Slack", fileName: "doc.pdf" })
      );
    });

    it("should handle file download when file info fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: false, file: {} }),
      });

      const result = await instance.executeSkill("slack_download_file", {
        file_id: "F1",
        user_id: "u1",
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to get file info");
    });

    it("should handle file download when url_private_download is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            file: { id: "F1", name: "doc.pdf", mimetype: "application/pdf", size: 1024 },
          }),
      });

      const result = await instance.executeSkill("slack_download_file", {
        file_id: "F1",
        user_id: "u1",
      });
      expect(result.success).toBe(false);
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("slack_unknown", {});
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
