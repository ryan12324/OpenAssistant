const mockFetch = vi.hoisted(() => vi.fn());
const mockDownloadAndIngestFile = vi.hoisted(() => vi.fn());
const mockFormatFileResults = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/integrations/chat/file-handler", () => ({
  downloadAndIngestFile: mockDownloadAndIngestFile,
  formatFileResults: mockFormatFileResults,
}));

import { MatrixInstance, matrixIntegration } from "@/lib/integrations/chat/matrix";

describe("MatrixInstance", () => {
  let instance: MatrixInstance;
  const config = { homeserverUrl: "https://matrix.org", accessToken: "tok", userId: "@bot:matrix.org" };

  beforeEach(() => {
    instance = new MatrixInstance(matrixIntegration, config);
    mockFetch.mockReset();
    mockDownloadAndIngestFile.mockReset();
    mockFormatFileResults.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(matrixIntegration.id).toBe("matrix");
      expect(matrixIntegration.category).toBe("chat");
      expect(matrixIntegration.skills.length).toBe(3);
    });
  });

  describe("connect", () => {
    it("should connect with valid credentials", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user_id: "@bot:matrix.org" }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if user_id is missing from whoami", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      await expect(instance.connect()).rejects.toThrow("Invalid Matrix credentials");
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
        json: () => Promise.resolve({ user_id: "@bot:matrix.org" }),
      });
      await instance.connect();
    });

    it("should send a message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ event_id: "$ev1" }),
      });
      const result = await instance.executeSkill("matrix_send_message", {
        room_id: "!room:matrix.org",
        message: "hello",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Message sent");
    });

    it("should list rooms", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ joined_rooms: ["!room1:m.org", "!room2:m.org"] }),
      });
      const result = await instance.executeSkill("matrix_list_rooms", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("!room1:m.org");
    });

    it("should download a file with valid mxc URL", async () => {
      mockDownloadAndIngestFile.mockResolvedValueOnce({ success: true, fileName: "file.pdf" });
      mockFormatFileResults.mockReturnValueOnce("file.pdf: processed");

      const result = await instance.executeSkill("matrix_download_file", {
        mxc_url: "mxc://matrix.org/abc123",
        file_name: "file.pdf",
        user_id: "u1",
      });
      expect(result.success).toBe(true);
      expect(mockDownloadAndIngestFile).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://matrix.org/_matrix/media/v3/download/matrix.org/abc123",
          source: "Matrix",
        })
      );
    });

    it("should fail with invalid mxc URL", async () => {
      const result = await instance.executeSkill("matrix_download_file", {
        mxc_url: "https://invalid-url",
        file_name: "file.pdf",
        user_id: "u1",
      });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Invalid mxc:// URL");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("matrix_unknown", {});
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
