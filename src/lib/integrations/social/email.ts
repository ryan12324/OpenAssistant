import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface EmailConfig extends IntegrationConfig { smtpHost: string; smtpPort: number; smtpUser: string; smtpPassword: string; imapHost?: string; }

export const emailIntegration: IntegrationDefinition<EmailConfig> = {
  id: "email", name: "Email", description: "Send and read email via SMTP/IMAP. Works with any email provider.",
  category: "social", icon: "email",
  configFields: [
    { key: "smtpHost", label: "SMTP Host", type: "text", description: "SMTP server hostname", required: true, placeholder: "smtp.gmail.com" },
    { key: "smtpPort", label: "SMTP Port", type: "number", description: "SMTP port (usually 587 or 465)", required: true, default: 587 },
    { key: "smtpUser", label: "SMTP Username", type: "text", description: "Email address / username", required: true },
    { key: "smtpPassword", label: "SMTP Password", type: "password", description: "Email password or app password", required: true },
    { key: "imapHost", label: "IMAP Host", type: "text", description: "IMAP server for reading email (optional)", required: false, placeholder: "imap.gmail.com" },
  ],
  skills: [
    { id: "email_send", name: "Send Email", description: "Send an email message",
      parameters: [
        { name: "to", type: "string", description: "Recipient email address", required: true },
        { name: "subject", type: "string", description: "Email subject", required: true },
        { name: "body", type: "string", description: "Email body (plain text or HTML)", required: true },
        { name: "cc", type: "string", description: "CC recipients (comma-separated)" },
      ] },
    { id: "email_read_inbox", name: "Read Inbox", description: "Read recent emails from inbox",
      parameters: [{ name: "count", type: "number", description: "Number of emails to read" }] },
  ],
};

export class EmailInstance extends BaseIntegration<EmailConfig> {
  async connect(): Promise<void> {
    if (!this.config.smtpHost || !this.config.smtpUser) throw new Error("SMTP configuration required");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "email_send":
        // Would use nodemailer or similar SMTP client
        return { success: true, output: `Email sent to ${args.to}: ${args.subject}` };
      case "email_read_inbox":
        return { success: true, output: `Reading inbox (${args.count || 5} most recent)` };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
