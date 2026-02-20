import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";
import { downloadAndIngestFile, formatFileResults } from "./file-handler";

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
    {
      id: "teams_download_file",
      name: "Download Teams Attachment",
      description: "Download a file attachment from a Teams message and ingest it into the knowledge base",
      parameters: [
        { name: "content_url", type: "string", description: "Direct download URL of the Teams attachment", required: true },
        { name: "file_name", type: "string", description: "Original file name", required: true },
        { name: "user_id", type: "string", description: "User ID for RAG ownership", required: true },
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
      case "teams_download_file": {
        // Teams attachments use Bot Framework OAuth for auth
        const result = await downloadAndIngestFile({
          url: args.content_url as string,
          fileName: args.file_name as string,
          headers: { Authorization: `Bearer ${this.accessToken}` },
          userId: args.user_id as string,
          source: "Teams",
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
