import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface OpenAIConfig extends IntegrationConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export const openaiIntegration: IntegrationDefinition<OpenAIConfig> = {
  id: "openai",
  name: "OpenAI",
  description: "GPT-4o, GPT-5, o1, o3 models. The default AI provider for chat completions.",
  category: "ai",
  icon: "openai",
  website: "https://platform.openai.com/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "OpenAI API key", required: true, placeholder: "sk-..." },
    { key: "baseUrl", label: "Base URL", type: "text", description: "Custom API base URL (for proxies)", required: false, default: "https://api.openai.com/v1" },
    { key: "model", label: "Default Model", type: "select", description: "Default model to use", required: false, options: [
      { label: "GPT-4o", value: "gpt-4o" },
      { label: "GPT-4o Mini", value: "gpt-4o-mini" },
      { label: "o1", value: "o1" },
      { label: "o3-mini", value: "o3-mini" },
    ], default: "gpt-4o" },
  ],
  skills: [
    {
      id: "openai_complete",
      name: "OpenAI Completion",
      description: "Generate a completion using OpenAI models",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt to complete", required: true },
        { name: "model", type: "string", description: "Model override" },
      ],
    },
  ],
};

export class OpenAIInstance extends BaseIntegration<OpenAIConfig> {
  async connect(): Promise<void> {
    const base = this.config.baseUrl || "https://api.openai.com/v1";
    const result = await this.apiFetch<{ data: unknown[] }>(`${base}/models`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });
    if (!result.data) throw new Error("Invalid API key");
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    const base = this.config.baseUrl || "https://api.openai.com/v1";
    switch (skillId) {
      case "openai_complete": {
        const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
          `${base}/chat/completions`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            body: JSON.stringify({
              model: args.model || this.config.model || "gpt-4o",
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
