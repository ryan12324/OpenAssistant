import type { IntegrationDefinition, IntegrationConfig, IntegrationStatus } from "../types";
import { BaseIntegration } from "../base";
import { downloadAndIngestFile, formatFileResults } from "./file-handler";

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
    {
      id: "telegram_download_file",
      name: "Download Telegram File",
      description: "Download a file from Telegram and ingest it into the knowledge base via RAG",
      parameters: [
        { name: "file_id", type: "string", description: "Telegram file_id from a message attachment", required: true },
        { name: "file_name", type: "string", description: "Original file name", required: true },
        { name: "user_id", type: "string", description: "User ID for RAG ownership", required: true },
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
      case "telegram_download_file": {
        // Step 1: Get file path from Telegram API
        const fileInfo = await this.apiFetch<{
          ok: boolean;
          result: { file_id: string; file_path: string; file_size?: number };
        }>(`${baseUrl}/getFile`, {
          method: "POST",
          body: JSON.stringify({ file_id: args.file_id }),
        });

        if (!fileInfo.ok || !fileInfo.result.file_path) {
          return { success: false, output: "Failed to get file info from Telegram" };
        }

        // Step 2: Download and ingest via shared handler
        const downloadUrl = `https://api.telegram.org/file/bot${this.config.botToken}/${fileInfo.result.file_path}`;
        const result = await downloadAndIngestFile({
          url: downloadUrl,
          fileName: args.file_name as string,
          userId: args.user_id as string,
          source: "Telegram",
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
