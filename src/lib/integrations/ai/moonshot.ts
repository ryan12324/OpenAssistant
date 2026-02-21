import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface MoonshotConfig extends IntegrationConfig {
  apiKey: string;
  model?: string;
}

export const moonshotIntegration: IntegrationDefinition<MoonshotConfig> = {
  id: "moonshot",
  name: "Moonshot AI",
  description: "Kimi and Moonshot models. Advanced reasoning with long-context capabilities.",
  category: "ai",
  icon: "moonshot",
  website: "https://platform.moonshot.ai/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "Moonshot API key", required: true, placeholder: "sk-..." },
    { key: "model", label: "Default Model", type: "select", description: "Default model to use", required: false, options: [
      { label: "Kimi 2.5", value: "kimi-2.5" },
      { label: "Kimi 2b", value: "kimi-2b" },
      { label: "Moonshot v1 (128k)", value: "moonshot-v1-128k" },
      { label: "Moonshot v1 (32k)", value: "moonshot-v1-32k" },
      { label: "Moonshot v1 (8k)", value: "moonshot-v1-8k" },
    ], default: "kimi-2.5" },
  ],
  skills: [{
    id: "moonshot_complete",
    name: "Moonshot Completion",
    description: "Generate a completion using Moonshot AI / Kimi models",
    parameters: [
      { name: "prompt", type: "string", description: "The prompt to complete", required: true },
      { name: "model", type: "string", description: "Model override (e.g. kimi-2.5, kimi-2b, moonshot-v1-128k)" },
    ],
  }],
};

export class MoonshotInstance extends BaseIntegration<MoonshotConfig> {
  async connect(): Promise<void> {
    const result = await this.apiFetch<{ models: unknown[] }>(
      "https://api.moonshot.ai/v1/models",
      {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      }
    );
    if (!result.models) {
      throw new Error("Failed to fetch models list");
    }
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "moonshot_complete") {
      const result = await this.apiFetch<{ choices: Array<{ message: { content: string } }> }>(
        "https://api.moonshot.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: (args.model as string) || this.config.model || "kimi-2.5",
            messages: [{ role: "user", content: args.prompt as string }],
            temperature: 0.3,
          }),
        }
      );
      
      if (!result.choices || result.choices.length === 0) {
        return { success: false, output: "No response from Moonshot API" };
      }
      
      return {
        success: true,
        output: result.choices[0].message.content,
        data: result,
      };
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
