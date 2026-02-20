import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface BlueBubblesConfig extends IntegrationConfig {
  serverUrl: string;
  password: string;
}

export const blueBubblesIntegration: IntegrationDefinition<BlueBubblesConfig> = {
  id: "bluebubbles",
  name: "BlueBubbles",
  description: "Apple messaging via BlueBubbles server. Access iMessage from any platform.",
  category: "chat",
  icon: "bluebubbles",
  website: "https://bluebubbles.app/",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "serverUrl",
      label: "Server URL",
      type: "text",
      description: "BlueBubbles server URL",
      required: true,
      placeholder: "http://localhost:1234",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      description: "BlueBubbles server password",
      required: true,
    },
  ],
  skills: [
    {
      id: "bluebubbles_send",
      name: "Send via BlueBubbles",
      description: "Send an iMessage via BlueBubbles server",
      parameters: [
        { name: "chat_guid", type: "string", description: "Chat GUID", required: true },
        { name: "message", type: "string", description: "Message text", required: true },
      ],
    },
    {
      id: "bluebubbles_list_chats",
      name: "List Chats",
      description: "List recent iMessage conversations",
      parameters: [],
    },
  ],
};

export class BlueBubblesInstance extends BaseIntegration<BlueBubblesConfig> {
  async connect(): Promise<void> {
    const result = await this.apiFetch<{ status: number }>(
      `${this.config.serverUrl}/api/v1/server/info?password=${this.config.password}`
    );
    if (result.status !== 200) throw new Error("Failed to connect to BlueBubbles server");
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  protected async handleSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }> {
    const pw = this.config.password;
    switch (skillId) {
      case "bluebubbles_send": {
        const result = await this.apiFetch(
          `${this.config.serverUrl}/api/v1/message/text?password=${pw}`,
          {
            method: "POST",
            body: JSON.stringify({
              chatGuid: args.chat_guid,
              message: args.message,
            }),
          }
        );
        return { success: true, output: "Message sent via BlueBubbles", data: result };
      }
      case "bluebubbles_list_chats": {
        const result = await this.apiFetch<{ data: { guid: string; displayName: string }[] }>(
          `${this.config.serverUrl}/api/v1/chat?password=${pw}&limit=20`
        );
        const list = result.data.map((c) => `${c.displayName || "Unknown"} (${c.guid})`).join("\n");
        return { success: true, output: `Recent chats:\n${list}`, data: result.data };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
