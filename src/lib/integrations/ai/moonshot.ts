import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface MoonshotConfig extends IntegrationConfig {
  apiKey: string;
  model?: string;
}

export const moonshotIntegration: IntegrationDefinition<MoonshotConfig> = {
  id: "moonshot",
  name: "Moonshot AI",
  description: "Kimi 2.5 and Moonshot models. Advanced reasoning and long-context capabilities.",
  category: "ai",
  icon: "moonshot",
  website: "https://platform.moonshot.cn/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "Moonshot API key", required: true, placeholder: "sk-..." },
    { key: "model", label: "Default Model", type: "select", description: "Default model", required: false, options: [
      { label: "Kimi 2.5", value: "kimi-2.5" },
      { label: "Moonshot v1 128k", value: "moonshot-v1-128k" },
      { label: "Moonshot v1 32k", value: "moonshot-v1-32k" },
      { label: "Moonshot v1 8k", value: "moonshot-v1-8k" },
    ], default: "kimi-2.5" },
  ],
  skills: [{
    id: "moonshot_complete",
    name: "Moonshot Completion",
    description: "Generate a completion using Moonshot AI / Kimi models",
    parameters: [
      { name: "prompt", type: "string", description: "The prompt to complete", required: true },
      { name: "model", type: "string", description: "Model override (e.g. kimi-2.5, moonshot-v1-128k)" },
    ],
  }],
};

export class MoonshotInstance extends BaseIntegration<MoonshotConfig> {
  async connect(): Promise<void> {
    await this.apiFetch("https://api.moonshot.cn/v1/models", {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "moonshot_complete") {
      const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
        "https://api.moonshot.cn/v1/chat/completions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
          body: JSON.stringify({
            model: (args.model as string) || this.config.model || "kimi-2.5",
            messages: [{ role: "user", content: args.prompt }],
          }),
        }
      );
      return { success: true, output: result.choices[0]?.message?.content || "", data: result };
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
