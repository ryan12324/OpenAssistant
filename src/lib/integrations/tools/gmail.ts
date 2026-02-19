import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface GmailConfig extends IntegrationConfig { clientId: string; clientSecret: string; refreshToken: string; }

export const gmailIntegration: IntegrationDefinition<GmailConfig> = {
  id: "gmail", name: "Gmail", description: "Pub/Sub email trigger integration. Read, send, and watch for new emails.",
  category: "tools", icon: "gmail", website: "https://developers.google.com/gmail/api",
  configFields: [
    { key: "clientId", label: "OAuth Client ID", type: "text", description: "Google OAuth 2.0 client ID", required: true },
    { key: "clientSecret", label: "OAuth Client Secret", type: "password", description: "Google OAuth 2.0 client secret", required: true },
    { key: "refreshToken", label: "Refresh Token", type: "password", description: "OAuth refresh token", required: true },
  ],
  skills: [
    { id: "gmail_read_inbox", name: "Read Inbox", description: "Read recent emails from inbox",
      parameters: [{ name: "count", type: "number", description: "Number of emails to read (default: 5)" }, { name: "query", type: "string", description: "Gmail search query (e.g., 'from:boss is:unread')" }] },
    { id: "gmail_send", name: "Send Email", description: "Send an email via Gmail",
      parameters: [
        { name: "to", type: "string", description: "Recipient email", required: true },
        { name: "subject", type: "string", description: "Email subject", required: true },
        { name: "body", type: "string", description: "Email body (plain text or HTML)", required: true },
      ] },
    { id: "gmail_search", name: "Search Email", description: "Search emails using Gmail query syntax",
      parameters: [{ name: "query", type: "string", description: "Gmail search query", required: true }] },
  ],
};

export class GmailInstance extends BaseIntegration<GmailConfig> {
  private accessToken = "";

  async connect(): Promise<void> {
    // Exchange refresh token for access token
    const res = await this.apiFetch<{ access_token: string }>("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: this.config.clientId, client_secret: this.config.clientSecret, refresh_token: this.config.refreshToken }).toString(),
    });
    this.accessToken = res.access_token;
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.accessToken = ""; this.status = "disconnected"; }

  private get headers() { return { Authorization: `Bearer ${this.accessToken}` }; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "gmail_read_inbox": {
        const count = (args.count as number) || 5;
        const q = (args.query as string) || "in:inbox";
        const list = await this.apiFetch<{ messages: { id: string }[] }>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${count}&q=${encodeURIComponent(q)}`, { headers: this.headers }
        );
        const emails = await Promise.all(
          (list.messages || []).slice(0, count).map((m) =>
            this.apiFetch<{ payload: { headers: { name: string; value: string }[] }; snippet: string }>(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, { headers: this.headers }
            )
          )
        );
        const summaries = emails.map((e) => {
          const subj = e.payload.headers.find((h) => h.name === "Subject")?.value || "(no subject)";
          const from = e.payload.headers.find((h) => h.name === "From")?.value || "";
          return `From: ${from}\nSubject: ${subj}\n${e.snippet}`;
        }).join("\n---\n");
        return { success: true, output: summaries || "No emails found", data: emails };
      }
      case "gmail_send": {
        const raw = btoa(`To: ${args.to}\r\nSubject: ${args.subject}\r\nContent-Type: text/html\r\n\r\n${args.body}`);
        await this.apiFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST", headers: this.headers, body: JSON.stringify({ raw }),
        });
        return { success: true, output: `Email sent to ${args.to}` };
      }
      case "gmail_search": {
        const list = await this.apiFetch<{ messages: { id: string }[]; resultSizeEstimate: number }>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(args.query as string)}`, { headers: this.headers }
        );
        return { success: true, output: `Found ${list.resultSizeEstimate} emails matching "${args.query}"`, data: list };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
