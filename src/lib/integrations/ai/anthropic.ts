import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface AnthropicConfig extends IntegrationConfig {
  apiKey: string;
  model?: string;
}

export const anthropicIntegration: IntegrationDefinition<AnthropicConfig> = {
  id: "anthropic",
  name: "Anthropic",
  description: "Claude Opus 4.5, Sonnet 4.5, and Haiku models. Advanced reasoning and coding.",
  category: "ai",
  icon: "anthropic",
  website: "https://console.anthropic.com/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "Anthropic API key", required: true },
    { key: "model", label: "Default Model", type: "select", description: "Default model", required: false, options: [
      { label: "Claude Opus 4.5", value: "claude-opus-4-5-20250929" },
      { label: "Claude Sonnet 4.5", value: "claude-sonnet-4-5-20250929" },
      { label: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
    ], default: "claude-sonnet-4-5-20250929" },
  ],
  skills: [
    {
      id: "anthropic_complete",
      name: "Anthropic Completion",
      description: "Generate a completion using Claude models",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt", required: true },
        { name: "model", type: "string", description: "Model override" },
      ],
    },
  ],
};

export class AnthropicInstance extends BaseIntegration<AnthropicConfig> {
  async connect(): Promise<void> {
    // Verify key with a minimal request
    const result = await this.apiFetch<{ id: string }>("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": this.config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
    });
    if (result.id) this.status = "connected";
  }

  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "anthropic_complete": {
        const result = await this.apiFetch<{ content: { text: string }[] }>(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: { "x-api-key": this.config.apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: args.model || this.config.model || "claude-sonnet-4-5-20250929",
              max_tokens: 4096,
              messages: [{ role: "user", content: args.prompt }],
            }),
          }
        );
        return { success: true, output: result.content[0]?.text || "", data: result };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
