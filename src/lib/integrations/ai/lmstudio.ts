import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface LMStudioConfig extends IntegrationConfig {
  baseUrl: string;
  model?: string;
}

export const lmstudioIntegration: IntegrationDefinition<LMStudioConfig> = {
  id: "lmstudio",
  name: "LM Studio (Local)",
  description: "Run local LLMs with LM Studio. OpenAI-compatible API for complete privacy.",
  category: "ai",
  icon: "lmstudio",
  website: "https://lmstudio.ai/",
  configFields: [
    { key: "baseUrl", label: "Base URL", type: "text", description: "LM Studio server URL", required: true, default: "http://localhost:1234" },
    { key: "model", label: "Model", type: "text", description: "Loaded model name (leave empty for default)", required: false },
  ],
  skills: [
    {
      id: "lmstudio_complete",
      name: "Local Completion",
      description: "Generate a completion using a local LM Studio model",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt", required: true },
        { name: "model", type: "string", description: "Model override" },
      ],
    },
    {
      id: "lmstudio_list_models",
      name: "List Local Models",
      description: "List models loaded in LM Studio",
      parameters: [],
    },
  ],
};

export class LMStudioInstance extends BaseIntegration<LMStudioConfig> {
  async connect(): Promise<void> {
    const result = await this.apiFetch<{ data: unknown[] }>(`${this.config.baseUrl}/v1/models`);
    if (!result.data) throw new Error("Cannot connect to LM Studio");
    this.status = "connected";
  }

  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "lmstudio_complete": {
        const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
          `${this.config.baseUrl}/v1/chat/completions`,
          {
            method: "POST",
            body: JSON.stringify({
              model: args.model || this.config.model || "local-model",
              messages: [{ role: "user", content: args.prompt }],
              max_tokens: 4096,
            }),
          }
        );
        return { success: true, output: result.choices[0]?.message?.content || "", data: result };
      }
      case "lmstudio_list_models": {
        const result = await this.apiFetch<{ data: { id: string }[] }>(`${this.config.baseUrl}/v1/models`);
        const list = result.data.map((m) => m.id).join("\n");
        return { success: true, output: `Loaded models:\n${list}`, data: result.data };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
