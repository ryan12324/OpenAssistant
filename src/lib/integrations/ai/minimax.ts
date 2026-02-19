import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface MiniMaxConfig extends IntegrationConfig {
  apiKey: string;
  model?: string;
}

export const minimaxIntegration: IntegrationDefinition<MiniMaxConfig> = {
  id: "minimax",
  name: "MiniMax",
  description: "MiniMax-M2.1 and other MiniMax models. Strong multilingual and reasoning capabilities.",
  category: "ai",
  icon: "minimax",
  website: "https://www.minimax.chat/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "MiniMax API key", required: true },
    { key: "model", label: "Default Model", type: "select", description: "Default model", required: false, options: [
      { label: "MiniMax-M2.1", value: "MiniMax-M2.1" },
      { label: "MiniMax-M1", value: "MiniMax-M1" },
    ], default: "MiniMax-M2.1" },
  ],
  skills: [
    {
      id: "minimax_complete",
      name: "MiniMax Completion",
      description: "Generate a completion using MiniMax models",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt", required: true },
        { name: "model", type: "string", description: "Model override" },
      ],
    },
  ],
};

export class MiniMaxInstance extends BaseIntegration<MiniMaxConfig> {
  async connect(): Promise<void> {
    const result = await this.apiFetch<{ choices: unknown[] }>("https://api.minimax.chat/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ model: this.config.model || "MiniMax-M2.1", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
    });
    if (result.choices) this.status = "connected";
  }

  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "minimax_complete": {
        const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
          "https://api.minimax.chat/v1/chat/completions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            body: JSON.stringify({
              model: args.model || this.config.model || "MiniMax-M2.1",
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
