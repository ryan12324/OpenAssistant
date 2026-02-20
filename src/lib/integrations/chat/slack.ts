import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";
import { downloadAndIngestFile, formatFileResults } from "./file-handler";

interface SlackConfig extends IntegrationConfig {
  botToken: string;
  signingSecret?: string;
  appToken?: string;
}

export const slackIntegration: IntegrationDefinition<SlackConfig> = {
  id: "slack",
  name: "Slack",
  description: "Workspace apps via Bolt framework. Send messages, manage channels, and respond to events.",
  category: "chat",
  icon: "slack",
  website: "https://api.slack.com/",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "botToken",
      label: "Bot Token",
      type: "password",
      description: "Slack Bot User OAuth Token (xoxb-...)",
      required: true,
      placeholder: "xoxb-...",
    },
    {
      key: "signingSecret",
      label: "Signing Secret",
      type: "password",
      description: "Slack App signing secret for verifying requests",
      required: false,
    },
    {
      key: "appToken",
      label: "App-Level Token",
      type: "password",
      description: "For Socket Mode connections (xapp-...)",
      required: false,
      placeholder: "xapp-...",
    },
  ],
  skills: [
    {
      id: "slack_send_message",
      name: "Send Slack Message",
      description: "Post a message to a Slack channel or DM",
      parameters: [
        { name: "channel", type: "string", description: "Channel ID or name (#general)", required: true },
        { name: "text", type: "string", description: "Message text (supports mrkdwn)", required: true },
      ],
    },
    {
      id: "slack_list_channels",
      name: "List Slack Channels",
      description: "List all accessible channels in the workspace",
      parameters: [],
    },
    {
      id: "slack_set_status",
      name: "Set Slack Status",
      description: "Set the bot's status in Slack",
      parameters: [
        { name: "text", type: "string", description: "Status text", required: true },
        { name: "emoji", type: "string", description: "Status emoji (e.g., :robot_face:)" },
      ],
    },
    {
      id: "slack_download_file",
      name: "Download Slack File",
      description: "Download a shared file from Slack and ingest it into the knowledge base",
      parameters: [
        { name: "file_id", type: "string", description: "Slack file ID (e.g., F0123456789)", required: true },
        { name: "user_id", type: "string", description: "User ID for RAG ownership", required: true },
      ],
    },
  ],
};

export class SlackInstance extends BaseIntegration<SlackConfig> {
  private readonly API = "https://slack.com/api";

  private get headers() {
    return { Authorization: `Bearer ${this.config.botToken}` };
  }

  async connect(): Promise<void> {
    if (!this.config.botToken) throw new Error("Bot token is required");

    const auth = await this.apiFetch<{ ok: boolean; error?: string }>(
      `${this.API}/auth.test`,
      { method: "POST", headers: this.headers }
    );
    if (!auth.ok) throw new Error(`Slack auth failed: ${auth.error}`);
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
      case "slack_send_message": {
        const result = await this.apiFetch<{ ok: boolean; ts: string }>(
          `${this.API}/chat.postMessage`,
          {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({ channel: args.channel, text: args.text }),
          }
        );
        return { success: result.ok, output: "Message posted to Slack", data: result };
      }
      case "slack_list_channels": {
        const result = await this.apiFetch<{
          ok: boolean;
          channels: { id: string; name: string }[];
        }>(`${this.API}/conversations.list`, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({ types: "public_channel,private_channel", limit: 100 }),
        });
        const list = result.channels.map((c) => `#${c.name} (${c.id})`).join("\n");
        return { success: true, output: `Channels:\n${list}`, data: result.channels };
      }
      case "slack_set_status": {
        const result = await this.apiFetch<{ ok: boolean }>(
          `${this.API}/users.profile.set`,
          {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({
              profile: {
                status_text: args.text,
                status_emoji: args.emoji || ":robot_face:",
              },
            }),
          }
        );
        return { success: result.ok, output: "Status updated", data: result };
      }
      case "slack_download_file": {
        // Step 1: Get file info from Slack API
        const fileInfo = await this.apiFetch<{
          ok: boolean;
          file: {
            id: string;
            name: string;
            mimetype: string;
            size: number;
            url_private_download: string;
          };
        }>(`${this.API}/files.info`, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({ file: args.file_id }),
        });

        if (!fileInfo.ok || !fileInfo.file.url_private_download) {
          return { success: false, output: "Failed to get file info from Slack" };
        }

        // Step 2: Download with auth and ingest
        const result = await downloadAndIngestFile({
          url: fileInfo.file.url_private_download,
          fileName: fileInfo.file.name,
          mimeType: fileInfo.file.mimetype,
          headers: { Authorization: `Bearer ${this.config.botToken}` },
          userId: args.user_id as string,
          source: "Slack",
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
