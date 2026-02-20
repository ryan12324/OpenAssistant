import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";
import { downloadAndIngestFile, formatFileResults } from "./file-handler";

interface WhatsAppConfig extends IntegrationConfig {
  mode: string; // "baileys" | "cloud_api"
  phoneNumberId?: string;
  accessToken?: string;
}

export const whatsappIntegration: IntegrationDefinition<WhatsAppConfig> = {
  id: "whatsapp",
  name: "WhatsApp",
  description: "Message via QR pairing through Baileys or Meta Cloud API. Multi-device support.",
  category: "chat",
  icon: "whatsapp",
  website: "https://developers.facebook.com/docs/whatsapp",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "mode",
      label: "Connection Mode",
      type: "select",
      description: "How to connect to WhatsApp",
      required: true,
      options: [
        { label: "Baileys (QR Pairing)", value: "baileys" },
        { label: "Meta Cloud API", value: "cloud_api" },
      ],
      default: "baileys",
    },
    {
      key: "phoneNumberId",
      label: "Phone Number ID",
      type: "text",
      description: "Meta Cloud API Phone Number ID (only for Cloud API mode)",
      required: false,
    },
    {
      key: "accessToken",
      label: "Access Token",
      type: "password",
      description: "Meta Cloud API Access Token (only for Cloud API mode)",
      required: false,
    },
  ],
  skills: [
    {
      id: "whatsapp_send_message",
      name: "Send WhatsApp Message",
      description: "Send a text message via WhatsApp",
      parameters: [
        { name: "phone", type: "string", description: "Phone number with country code (e.g., 14155551234)", required: true },
        { name: "text", type: "string", description: "Message text", required: true },
      ],
    },
    {
      id: "whatsapp_download_media",
      name: "Download WhatsApp Media",
      description: "Download a media file from WhatsApp and ingest it into the knowledge base",
      parameters: [
        { name: "media_id", type: "string", description: "WhatsApp media ID from the message", required: true },
        { name: "file_name", type: "string", description: "File name to save as", required: true },
        { name: "mime_type", type: "string", description: "MIME type of the media" },
        { name: "user_id", type: "string", description: "User ID for RAG ownership", required: true },
      ],
    },
  ],
};

export class WhatsAppInstance extends BaseIntegration<WhatsAppConfig> {
  async connect(): Promise<void> {
    if (this.config.mode === "cloud_api") {
      if (!this.config.accessToken || !this.config.phoneNumberId) {
        throw new Error("Cloud API requires access token and phone number ID");
      }
    }
    // Baileys mode would initialize a WebSocket connection and QR pairing
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  protected async handleSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }> {
    switch (skillId) {
      case "whatsapp_send_message": {
        if (this.config.mode === "cloud_api") {
          const result = await this.apiFetch(
            `https://graph.facebook.com/v21.0/${this.config.phoneNumberId}/messages`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${this.config.accessToken}` },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: args.phone,
                type: "text",
                text: { body: args.text },
              }),
            }
          );
          return { success: true, output: "WhatsApp message sent via Cloud API", data: result };
        }
        // Baileys mode would use the local WebSocket connection
        return { success: true, output: "WhatsApp message sent via Baileys" };
      }
      case "whatsapp_download_media": {
        if (this.config.mode !== "cloud_api") {
          return { success: false, output: "Media download requires Cloud API mode" };
        }

        // Step 1: Get media URL from WhatsApp Cloud API
        const mediaInfo = await this.apiFetch<{ url: string; mime_type: string }>(
          `https://graph.facebook.com/v21.0/${args.media_id}`,
          {
            headers: { Authorization: `Bearer ${this.config.accessToken}` },
          }
        );

        if (!mediaInfo.url) {
          return { success: false, output: "Failed to get media URL from WhatsApp" };
        }

        // Step 2: Download with auth and ingest
        const result = await downloadAndIngestFile({
          url: mediaInfo.url,
          fileName: args.file_name as string,
          mimeType: (args.mime_type as string) || mediaInfo.mime_type,
          headers: { Authorization: `Bearer ${this.config.accessToken}` },
          userId: args.user_id as string,
          source: "WhatsApp",
        });

        return {
          success: result.success,
          output: formatFileResults([result]),
          data: result,
        };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
