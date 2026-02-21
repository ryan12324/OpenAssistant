import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface WebhooksConfig extends IntegrationConfig { secret?: string; }

export const webhooksIntegration: IntegrationDefinition<WebhooksConfig> = {
  id: "webhooks", name: "Webhooks", description: "External trigger support. Receive and send webhooks to integrate with any service.",
  category: "tools", icon: "webhooks",
  configFields: [
    { key: "secret", label: "Webhook Secret", type: "password", description: "Shared secret for webhook verification", required: false },
  ],
  skills: [
    { id: "webhook_send", name: "Send Webhook", description: "Send a webhook/HTTP request to an external URL",
      parameters: [
        { name: "url", type: "string", description: "Webhook URL", required: true },
        { name: "method", type: "string", description: "HTTP method (GET, POST, PUT)" },
        { name: "body", type: "string", description: "JSON body to send" },
        { name: "headers", type: "string", description: "JSON headers to include" },
      ] },
  ],
};

export class WebhooksInstance extends BaseIntegration<WebhooksConfig> {
  async connect(): Promise<void> { this.status = "connected"; }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "webhook_send") {
      try {
        const method = (args.method as string) || "POST";
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (args.headers) Object.assign(headers, JSON.parse(args.headers as string));
        const res = await fetch(args.url as string, { method, headers, body: args.body as string, signal: AbortSignal.timeout(Number(process.env.FETCH_TIMEOUT_MS ?? "10000")) });
        const text = await res.text();
        return { success: res.ok, output: `Webhook ${method} ${args.url} → ${res.status}\n${text.slice(0, 500)}`, data: { status: res.status } };
      } catch (e) { return { success: false, output: `Webhook failed: ${e instanceof Error ? e.message : "Unknown error"}` }; }
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
