import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface VercelGatewayConfig extends IntegrationConfig {
  apiKey: string;
  model?: string;
}

export const vercelGatewayIntegration: IntegrationDefinition<VercelGatewayConfig> = {
  id: "vercel-gateway",
  name: "Vercel AI Gateway",
  description: "Access hundreds of AI models through Vercel's unified gateway. One API, every model.",
  category: "ai",
  icon: "vercel",
  website: "https://vercel.com/docs/ai-gateway",
  configFields: [
    { key: "apiKey", label: "Gateway API Key", type: "password", description: "Vercel AI Gateway key", required: true },
    { key: "model", label: "Default Model", type: "text", description: "Model in provider/model format (e.g., openai/gpt-4o)", required: false, default: "openai/gpt-4o" },
  ],
  skills: [
    {
      id: "vercel_gateway_complete",
      name: "Gateway Completion",
      description: "Generate a completion via Vercel AI Gateway (supports any provider)",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt", required: true },
        { name: "model", type: "string", description: "Model in provider/model format (e.g., anthropic/claude-sonnet-4-5-20250929)" },
      ],
    },
  ],
};

export class VercelGatewayInstance extends BaseIntegration<VercelGatewayConfig> {
  async connect(): Promise<void> {
    const result = await this.apiFetch<{ choices: unknown[] }>("https://gateway.ai.vercel.app/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ model: this.config.model || "openai/gpt-4o", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
    });
    if (result.choices) this.status = "connected";
  }

  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "vercel_gateway_complete": {
        const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
          "https://gateway.ai.vercel.app/v1/chat/completions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            body: JSON.stringify({
              model: args.model || this.config.model || "openai/gpt-4o",
              messages: [{ role: "user", content: args.prompt }],
              max_tokens: 4096,
            }),
          }
        );
        return { success: true, output: result.choices[0]?.message?.content || "", data: result };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
