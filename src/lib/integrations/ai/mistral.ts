import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface MistralConfig extends IntegrationConfig { apiKey: string; model?: string; }

export const mistralIntegration: IntegrationDefinition<MistralConfig> = {
  id: "mistral", name: "Mistral", description: "Mistral Large and Codestral models. European AI with strong multilingual support.",
  category: "ai", icon: "mistral", website: "https://console.mistral.ai/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "Mistral API key", required: true },
    { key: "model", label: "Default Model", type: "select", description: "Default model", required: false, options: [
      { label: "Mistral Large", value: "mistral-large-latest" },
      { label: "Codestral", value: "codestral-latest" },
      { label: "Mistral Small", value: "mistral-small-latest" },
    ], default: "mistral-large-latest" },
  ],
  skills: [{
    id: "mistral_complete", name: "Mistral Completion", description: "Generate a completion using Mistral models",
    parameters: [{ name: "prompt", type: "string", description: "The prompt", required: true }, { name: "model", type: "string", description: "Model override" }],
  }],
};

export class MistralInstance extends BaseIntegration<MistralConfig> {
  async connect(): Promise<void> {
    await this.apiFetch("https://api.mistral.ai/v1/models", { headers: { Authorization: `Bearer ${this.config.apiKey}` } });
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }
  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "mistral_complete") {
      const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
        "https://api.mistral.ai/v1/chat/completions",
        { method: "POST", headers: { Authorization: `Bearer ${this.config.apiKey}` },
          body: JSON.stringify({ model: args.model || this.config.model || "mistral-large-latest", messages: [{ role: "user", content: args.prompt }] }) }
      );
      return { success: true, output: result.choices[0]?.message?.content || "", data: result };
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
