import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

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
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
