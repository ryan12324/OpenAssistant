import type { IntegrationDefinition, IntegrationConfig, IntegrationStatus } from "../types";
import { BaseIntegration } from "../base";

interface TelegramConfig extends IntegrationConfig {
  botToken: string;
  allowedChatIds?: string;
}

export const telegramIntegration: IntegrationDefinition<TelegramConfig> = {
  id: "telegram",
  name: "Telegram",
  description: "Bot API integration using grammY. Receive and send messages via Telegram bots.",
  category: "chat",
  icon: "telegram",
  website: "https://core.telegram.org/bots",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "botToken",
      label: "Bot Token",
      type: "password",
      description: "Telegram Bot API token from @BotFather",
      required: true,
      placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    },
    {
      key: "allowedChatIds",
      label: "Allowed Chat IDs",
      type: "text",
      description: "Comma-separated list of allowed chat IDs (leave empty for all)",
      required: false,
    },
  ],
  skills: [
    {
      id: "telegram_send_message",
      name: "Send Telegram Message",
      description: "Send a message to a Telegram chat",
      parameters: [
        { name: "chat_id", type: "string", description: "Telegram chat ID", required: true },
        { name: "text", type: "string", description: "Message text (supports Markdown)", required: true },
      ],
    },
    {
      id: "telegram_send_photo",
      name: "Send Telegram Photo",
      description: "Send a photo to a Telegram chat",
      parameters: [
        { name: "chat_id", type: "string", description: "Telegram chat ID", required: true },
        { name: "photo_url", type: "string", description: "URL of the photo to send", required: true },
        { name: "caption", type: "string", description: "Photo caption" },
      ],
    },
  ],
};

export class TelegramInstance extends BaseIntegration<TelegramConfig> {
  private pollingAbort?: AbortController;

  async connect(): Promise<void> {
    if (!this.config.botToken) throw new Error("Bot token is required");

    // Verify bot token by calling getMe
    const me = await this.apiFetch<{ ok: boolean; result: { username: string } }>(
      `https://api.telegram.org/bot${this.config.botToken}/getMe`
    );

    if (!me.ok) throw new Error("Invalid bot token");
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.pollingAbort?.abort();
    this.status = "disconnected";
  }

  protected async handleSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }> {
    const baseUrl = `https://api.telegram.org/bot${this.config.botToken}`;

    switch (skillId) {
      case "telegram_send_message": {
        const result = await this.apiFetch(`${baseUrl}/sendMessage`, {
          method: "POST",
          body: JSON.stringify({
            chat_id: args.chat_id,
            text: args.text,
            parse_mode: "Markdown",
          }),
        });
        return { success: true, output: "Message sent successfully", data: result };
      }
      case "telegram_send_photo": {
        const result = await this.apiFetch(`${baseUrl}/sendPhoto`, {
          method: "POST",
          body: JSON.stringify({
            chat_id: args.chat_id,
            photo: args.photo_url,
            caption: args.caption,
          }),
        });
        return { success: true, output: "Photo sent successfully", data: result };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
