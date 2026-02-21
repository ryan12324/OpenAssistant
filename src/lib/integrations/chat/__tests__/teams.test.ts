const mockFetch = vi.hoisted(() => vi.fn());
const mockDownloadAndIngestFile = vi.hoisted(() => vi.fn());
const mockFormatFileResults = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/integrations/chat/file-handler", () => ({
  downloadAndIngestFile: mockDownloadAndIngestFile,
  formatFileResults: mockFormatFileResults,
}));

import { TeamsInstance, teamsIntegration } from "@/lib/integrations/chat/teams";

describe("TeamsInstance", () => {
  let instance: TeamsInstance;
  const config = { appId: "app-id", appPassword: "app-pass" };

  beforeEach(() => {
    instance = new TeamsInstance(teamsIntegration, config);
    mockFetch.mockReset();
    mockDownloadAndIngestFile.mockReset();
    mockFormatFileResults.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(teamsIntegration.id).toBe("teams");
      expect(teamsIntegration.category).toBe("chat");
      expect(teamsIntegration.skills.length).toBe(2);
    });
  });

  describe("connect", () => {
    it("should get OAuth token and connect", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "at-123" }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });
  });

  describe("disconnect", () => {
    it("should clear access token and disconnect", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "at-123" }),
      });
      await instance.connect();
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "at-123" }),
      });
      await instance.connect();
    });

    it("should send a message", async () => {
      const result = await instance.executeSkill("teams_send_message", {
        conversation_id: "conv1",
        text: "hello",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Message sent to Teams");
    });

    it("should download a file", async () => {
      mockDownloadAndIngestFile.mockResolvedValueOnce({ success: true, fileName: "file.docx" });
      mockFormatFileResults.mockReturnValueOnce("file.docx: processed");

      const result = await instance.executeSkill("teams_download_file", {
        content_url: "https://teams.com/file.docx",
        file_name: "file.docx",
        user_id: "u1",
      });
      expect(result.success).toBe(true);
      expect(mockDownloadAndIngestFile).toHaveBeenCalledWith(
        expect.objectContaining({ source: "Teams" })
      );
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("teams_unknown", {});
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
