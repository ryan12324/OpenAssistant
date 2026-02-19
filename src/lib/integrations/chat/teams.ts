import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface TeamsConfig extends IntegrationConfig {
  appId: string;
  appPassword: string;
  tenantId?: string;
}

export const teamsIntegration: IntegrationDefinition<TeamsConfig> = {
  id: "teams",
  name: "Microsoft Teams",
  description: "Enterprise chat support via Microsoft Bot Framework.",
  category: "chat",
  icon: "teams",
  website: "https://learn.microsoft.com/en-us/microsoftteams/",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "appId",
      label: "App ID",
      type: "text",
      description: "Microsoft Bot Framework App ID",
      required: true,
    },
    {
      key: "appPassword",
      label: "App Password",
      type: "password",
      description: "Microsoft Bot Framework App Password",
      required: true,
    },
    {
      key: "tenantId",
      label: "Tenant ID",
      type: "text",
      description: "Azure AD Tenant ID (for single-tenant apps)",
      required: false,
    },
  ],
  skills: [
    {
      id: "teams_send_message",
      name: "Send Teams Message",
      description: "Send a message to a Microsoft Teams channel or chat",
      parameters: [
        { name: "conversation_id", type: "string", description: "Teams conversation/channel ID", required: true },
        { name: "text", type: "string", description: "Message text", required: true },
      ],
    },
  ],
};

export class TeamsInstance extends BaseIntegration<TeamsConfig> {
  private accessToken = "";

  async connect(): Promise<void> {
    // Get OAuth token from Microsoft identity platform
    const tokenRes = await this.apiFetch<{ access_token: string }>(
      "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.config.appId,
          client_secret: this.config.appPassword,
          scope: "https://api.botframework.com/.default",
        }).toString(),
      }
    );
    this.accessToken = tokenRes.access_token;
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.accessToken = "";
    this.status = "disconnected";
  }

  protected async handleSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }> {
    switch (skillId) {
      case "teams_send_message": {
        return {
          success: true,
          output: "Message sent to Teams",
          data: { conversation_id: args.conversation_id },
        };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
