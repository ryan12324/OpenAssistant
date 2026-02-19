import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

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
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
