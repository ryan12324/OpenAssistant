import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface OpenRouterConfig extends IntegrationConfig {
  apiKey: string;
  model?: string;
}

export const openrouterIntegration: IntegrationDefinition<OpenRouterConfig> = {
  id: "openrouter",
  name: "OpenRouter",
  description: "Unified API gateway for hundreds of AI models. One key, every model.",
  category: "ai",
  icon: "openrouter",
  website: "https://openrouter.ai/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "OpenRouter API key", required: true },
    { key: "model", label: "Default Model", type: "text", description: "Model identifier (e.g., anthropic/claude-3.5-sonnet)", required: false },
  ],
  skills: [
    {
      id: "openrouter_complete",
      name: "OpenRouter Completion",
      description: "Route a completion to any model via OpenRouter",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt", required: true },
        { name: "model", type: "string", description: "Model to use (e.g., openai/gpt-4o)" },
      ],
    },
  ],
};

export class OpenRouterInstance extends BaseIntegration<OpenRouterConfig> {
  async connect(): Promise<void> {
    const result = await this.apiFetch<{ data: unknown[] }>("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });
    if (!result.data) throw new Error("Invalid OpenRouter API key");
    this.status = "connected";
  }

  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "openrouter_complete": {
        const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            body: JSON.stringify({
              model: args.model || this.config.model || "openai/gpt-4o",
              messages: [{ role: "user", content: args.prompt }],
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
