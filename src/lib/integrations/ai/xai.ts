import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface XAIConfig extends IntegrationConfig { apiKey: string; model?: string; }

export const xaiIntegration: IntegrationDefinition<XAIConfig> = {
  id: "xai", name: "xAI", description: "Grok 3 & 4 models from xAI. Fast reasoning with real-time information.",
  category: "ai", icon: "xai", website: "https://console.x.ai/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "xAI API key", required: true },
    { key: "model", label: "Default Model", type: "select", description: "Default model", required: false, options: [
      { label: "Grok 3", value: "grok-3" },
      { label: "Grok 3 Mini", value: "grok-3-mini" },
    ], default: "grok-3" },
  ],
  skills: [{
    id: "xai_complete", name: "xAI Completion", description: "Generate a completion using Grok models",
    parameters: [{ name: "prompt", type: "string", description: "The prompt", required: true }],
  }],
};

export class XAIInstance extends BaseIntegration<XAIConfig> {
  async connect(): Promise<void> {
    await this.apiFetch("https://api.x.ai/v1/models", { headers: { Authorization: `Bearer ${this.config.apiKey}` } });
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }
  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "xai_complete") {
      const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
        "https://api.x.ai/v1/chat/completions",
        { method: "POST", headers: { Authorization: `Bearer ${this.config.apiKey}` },
          body: JSON.stringify({ model: this.config.model || "grok-3", messages: [{ role: "user", content: args.prompt }] }) }
      );
      return { success: true, output: result.choices[0]?.message?.content || "", data: result };
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
