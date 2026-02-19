import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface MatrixConfig extends IntegrationConfig {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
}

export const matrixIntegration: IntegrationDefinition<MatrixConfig> = {
  id: "matrix",
  name: "Matrix",
  description: "Decentralized messaging protocol. Connect to any Matrix homeserver (Element, etc.).",
  category: "chat",
  icon: "matrix",
  website: "https://matrix.org/",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "homeserverUrl",
      label: "Homeserver URL",
      type: "text",
      description: "Matrix homeserver base URL",
      required: true,
      placeholder: "https://matrix.org",
    },
    {
      key: "accessToken",
      label: "Access Token",
      type: "password",
      description: "Matrix access token",
      required: true,
    },
    {
      key: "userId",
      label: "User ID",
      type: "text",
      description: "Full Matrix user ID",
      required: true,
      placeholder: "@bot:matrix.org",
    },
  ],
  skills: [
    {
      id: "matrix_send_message",
      name: "Send Matrix Message",
      description: "Send a message to a Matrix room",
      parameters: [
        { name: "room_id", type: "string", description: "Matrix room ID", required: true },
        { name: "message", type: "string", description: "Message text", required: true },
      ],
    },
    {
      id: "matrix_list_rooms",
      name: "List Matrix Rooms",
      description: "List joined Matrix rooms",
      parameters: [],
    },
  ],
};

export class MatrixInstance extends BaseIntegration<MatrixConfig> {
  private get headers() {
    return { Authorization: `Bearer ${this.config.accessToken}` };
  }

  async connect(): Promise<void> {
    const whoami = await this.apiFetch<{ user_id: string }>(
      `${this.config.homeserverUrl}/_matrix/client/v3/account/whoami`,
      { headers: this.headers }
    );
    if (!whoami.user_id) throw new Error("Invalid Matrix credentials");
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
      case "matrix_send_message": {
        const txnId = Date.now().toString();
        const result = await this.apiFetch(
          `${this.config.homeserverUrl}/_matrix/client/v3/rooms/${args.room_id}/send/m.room.message/${txnId}`,
          {
            method: "PUT",
            headers: this.headers,
            body: JSON.stringify({ msgtype: "m.text", body: args.message }),
          }
        );
        return { success: true, output: "Message sent to Matrix room", data: result };
      }
      case "matrix_list_rooms": {
        const result = await this.apiFetch<{
          joined_rooms: string[];
        }>(`${this.config.homeserverUrl}/_matrix/client/v3/joined_rooms`, {
          headers: this.headers,
        });
        return {
          success: true,
          output: `Joined rooms:\n${result.joined_rooms.join("\n")}`,
          data: result,
        };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
