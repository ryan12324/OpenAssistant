import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface DeepSeekConfig extends IntegrationConfig { apiKey: string; model?: string; }

export const deepseekIntegration: IntegrationDefinition<DeepSeekConfig> = {
  id: "deepseek", name: "DeepSeek", description: "DeepSeek V3 and R1 reasoning models. Excellent code generation.",
  category: "ai", icon: "deepseek", website: "https://platform.deepseek.com/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "DeepSeek API key", required: true },
    { key: "model", label: "Default Model", type: "select", description: "Default model", required: false, options: [
      { label: "DeepSeek V3", value: "deepseek-chat" },
      { label: "DeepSeek R1", value: "deepseek-reasoner" },
    ], default: "deepseek-chat" },
  ],
  skills: [{
    id: "deepseek_complete", name: "DeepSeek Completion", description: "Generate a completion using DeepSeek",
    parameters: [{ name: "prompt", type: "string", description: "The prompt", required: true }],
  }],
};

export class DeepSeekInstance extends BaseIntegration<DeepSeekConfig> {
  async connect(): Promise<void> {
    await this.apiFetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${this.config.apiKey}` } });
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }
  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "deepseek_complete") {
      const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
        "https://api.deepseek.com/chat/completions",
        { method: "POST", headers: { Authorization: `Bearer ${this.config.apiKey}` },
          body: JSON.stringify({ model: this.config.model || "deepseek-chat", messages: [{ role: "user", content: args.prompt }] }) }
      );
      return { success: true, output: result.choices[0]?.message?.content || "", data: result };
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
