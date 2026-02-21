const mockFetch = vi.hoisted(() => vi.fn());
const mockDownloadAndIngestFile = vi.hoisted(() => vi.fn());
const mockFormatFileResults = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/integrations/chat/file-handler", () => ({
  downloadAndIngestFile: mockDownloadAndIngestFile,
  formatFileResults: mockFormatFileResults,
}));

import { WhatsAppInstance, whatsappIntegration } from "@/lib/integrations/chat/whatsapp";

describe("WhatsAppInstance", () => {
  const cloudConfig = { mode: "cloud_api", phoneNumberId: "123", accessToken: "tok" };
  const baileysConfig = { mode: "baileys" };

  beforeEach(() => {
    mockFetch.mockReset();
    mockDownloadAndIngestFile.mockReset();
    mockFormatFileResults.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(whatsappIntegration.id).toBe("whatsapp");
      expect(whatsappIntegration.category).toBe("chat");
      expect(whatsappIntegration.skills.length).toBe(2);
    });
  });

  describe("connect", () => {
    it("should connect in cloud_api mode", async () => {
      const inst = new WhatsAppInstance(whatsappIntegration, cloudConfig);
      await inst.connect();
      expect(inst.status).toBe("connected");
    });

    it("should throw in cloud_api mode without accessToken", async () => {
      const inst = new WhatsAppInstance(whatsappIntegration, { mode: "cloud_api" });
      await expect(inst.connect()).rejects.toThrow("Cloud API requires");
    });

    it("should throw in cloud_api mode without phoneNumberId", async () => {
      const inst = new WhatsAppInstance(whatsappIntegration, { mode: "cloud_api", accessToken: "tok" });
      await expect(inst.connect()).rejects.toThrow("Cloud API requires");
    });

    it("should connect in baileys mode", async () => {
      const inst = new WhatsAppInstance(whatsappIntegration, baileysConfig);
      await inst.connect();
      expect(inst.status).toBe("connected");
    });
  });

  describe("disconnect", () => {
    it("should set status to disconnected", async () => {
      const inst = new WhatsAppInstance(whatsappIntegration, baileysConfig);
      await inst.connect();
      await inst.disconnect();
      expect(inst.status).toBe("disconnected");
    });
  });

  describe("executeSkill", () => {
    describe("cloud_api mode", () => {
      let inst: WhatsAppInstance;

      beforeEach(async () => {
        inst = new WhatsAppInstance(whatsappIntegration, cloudConfig);
        await inst.connect();
      });

      it("should send message via Cloud API", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ messages: [{ id: "m1" }] }),
        });
        const result = await inst.executeSkill("whatsapp_send_message", {
          phone: "14155551234",
          text: "hello",
        });
        expect(result.success).toBe(true);
        expect(result.output).toContain("Cloud API");
      });

      it("should download media via Cloud API", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ url: "https://media.whatsapp.com/file.pdf", mime_type: "application/pdf" }),
        });
        mockDownloadAndIngestFile.mockResolvedValueOnce({ success: true, fileName: "file.pdf" });
        mockFormatFileResults.mockReturnValueOnce("file.pdf: processed");

        const result = await inst.executeSkill("whatsapp_download_media", {
          media_id: "m1",
          file_name: "file.pdf",
          user_id: "u1",
        });
        expect(result.success).toBe(true);
        expect(mockDownloadAndIngestFile).toHaveBeenCalledWith(
          expect.objectContaining({ source: "WhatsApp" })
        );
      });

      it("should use args mime_type over mediaInfo if provided", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ url: "https://media.whatsapp.com/img.jpg", mime_type: "image/jpeg" }),
        });
        mockDownloadAndIngestFile.mockResolvedValueOnce({ success: true, fileName: "img.jpg" });
        mockFormatFileResults.mockReturnValueOnce("img.jpg: processed");

        await inst.executeSkill("whatsapp_download_media", {
          media_id: "m1",
          file_name: "img.jpg",
          mime_type: "image/png",
          user_id: "u1",
        });
        expect(mockDownloadAndIngestFile).toHaveBeenCalledWith(
          expect.objectContaining({ mimeType: "image/png" })
        );
      });

      it("should fail when media URL is missing", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ mime_type: "application/pdf" }),
        });
        const result = await inst.executeSkill("whatsapp_download_media", {
          media_id: "m1",
          file_name: "file.pdf",
          user_id: "u1",
        });
        expect(result.success).toBe(false);
        expect(result.output).toContain("Failed to get media URL");
      });
    });

    describe("baileys mode", () => {
      let inst: WhatsAppInstance;

      beforeEach(async () => {
        inst = new WhatsAppInstance(whatsappIntegration, baileysConfig);
        await inst.connect();
      });

      it("should send message via Baileys", async () => {
        const result = await inst.executeSkill("whatsapp_send_message", {
          phone: "14155551234",
          text: "hello",
        });
        expect(result.success).toBe(true);
        expect(result.output).toContain("Baileys");
      });

      it("should fail to download media in baileys mode", async () => {
        const result = await inst.executeSkill("whatsapp_download_media", {
          media_id: "m1",
          file_name: "file.pdf",
          user_id: "u1",
        });
        expect(result.success).toBe(false);
        expect(result.output).toContain("requires Cloud API");
      });
    });

    it("should return error for unknown skill", async () => {
      const inst = new WhatsAppInstance(whatsappIntegration, baileysConfig);
      await inst.connect();
      const result = await inst.executeSkill("whatsapp_unknown", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const inst = new WhatsAppInstance(whatsappIntegration, baileysConfig);
      await inst.connect();
      const result = await (inst as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
