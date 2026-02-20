import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";
import { downloadAndIngestFile, formatFileResults } from "./file-handler";

interface DiscordConfig extends IntegrationConfig {
  botToken: string;
  guildId?: string;
}

export const discordIntegration: IntegrationDefinition<DiscordConfig> = {
  id: "discord",
  name: "Discord",
  description: "Support for servers, channels, and DMs via Discord Bot API.",
  category: "chat",
  icon: "discord",
  website: "https://discord.com/developers",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "botToken",
      label: "Bot Token",
      type: "password",
      description: "Discord bot token from Developer Portal",
      required: true,
    },
    {
      key: "guildId",
      label: "Guild ID",
      type: "text",
      description: "Discord server ID to restrict to (optional)",
      required: false,
    },
  ],
  skills: [
    {
      id: "discord_send_message",
      name: "Send Discord Message",
      description: "Send a message to a Discord channel",
      parameters: [
        { name: "channel_id", type: "string", description: "Discord channel ID", required: true },
        { name: "content", type: "string", description: "Message content", required: true },
      ],
    },
    {
      id: "discord_list_channels",
      name: "List Discord Channels",
      description: "List channels in a Discord server",
      parameters: [
        { name: "guild_id", type: "string", description: "Server/guild ID", required: true },
      ],
    },
    {
      id: "discord_download_file",
      name: "Download Discord Attachment",
      description: "Download a file attachment from a Discord message and ingest it into the knowledge base",
      parameters: [
        { name: "attachment_url", type: "string", description: "Direct CDN URL of the Discord attachment", required: true },
        { name: "file_name", type: "string", description: "Original file name", required: true },
        { name: "user_id", type: "string", description: "User ID for RAG ownership", required: true },
      ],
    },
  ],
};

export class DiscordInstance extends BaseIntegration<DiscordConfig> {
  private readonly API_BASE = "https://discord.com/api/v10";

  async connect(): Promise<void> {
    if (!this.config.botToken) throw new Error("Bot token is required");

    const user = await this.apiFetch<{ id: string; username: string }>(
      `${this.API_BASE}/users/@me`,
      { headers: { Authorization: `Bot ${this.config.botToken}` } }
    );
    if (!user.id) throw new Error("Invalid bot token");
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  protected async handleSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }> {
    const headers = { Authorization: `Bot ${this.config.botToken}` };

    switch (skillId) {
      case "discord_send_message": {
        const result = await this.apiFetch(
          `${this.API_BASE}/channels/${args.channel_id}/messages`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ content: args.content }),
          }
        );
        return { success: true, output: "Message sent to Discord channel", data: result };
      }
      case "discord_list_channels": {
        const channels = await this.apiFetch<{ id: string; name: string; type: number }[]>(
          `${this.API_BASE}/guilds/${args.guild_id}/channels`,
          { headers }
        );
        const textChannels = channels.filter((c) => c.type === 0);
        const list = textChannels.map((c) => `#${c.name} (${c.id})`).join("\n");
        return { success: true, output: `Channels:\n${list}`, data: channels };
      }
      case "discord_download_file": {
        // Discord attachment URLs are direct CDN links, no additional auth needed
        const result = await downloadAndIngestFile({
          url: args.attachment_url as string,
          fileName: args.file_name as string,
          userId: args.user_id as string,
          source: "Discord",
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
