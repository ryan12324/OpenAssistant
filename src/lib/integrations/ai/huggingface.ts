import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface HuggingFaceConfig extends IntegrationConfig {
  apiKey: string;
  model?: string;
}

export const huggingfaceIntegration: IntegrationDefinition<HuggingFaceConfig> = {
  id: "huggingface",
  name: "Hugging Face",
  description: "Access thousands of open-source models via Hugging Face Inference API.",
  category: "ai",
  icon: "huggingface",
  website: "https://huggingface.co/",
  configFields: [
    { key: "apiKey", label: "API Token", type: "password", description: "Hugging Face API token", required: true },
    { key: "model", label: "Default Model", type: "text", description: "Model ID (e.g., meta-llama/Llama-3.1-70B-Instruct)", required: false, default: "meta-llama/Llama-3.1-70B-Instruct" },
  ],
  skills: [
    {
      id: "huggingface_complete",
      name: "Hugging Face Completion",
      description: "Generate a completion using a Hugging Face model",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt", required: true },
        { name: "model", type: "string", description: "Model ID override" },
      ],
    },
    {
      id: "huggingface_list_models",
      name: "Search Models",
      description: "Search for models on Hugging Face",
      parameters: [
        { name: "query", type: "string", description: "Search query", required: true },
      ],
    },
  ],
};

export class HuggingFaceInstance extends BaseIntegration<HuggingFaceConfig> {
  async connect(): Promise<void> {
    const result = await this.apiFetch<{ username: string }>("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });
    if (result.username) this.status = "connected";
  }

  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "huggingface_complete": {
        const model = (args.model as string) || this.config.model || "meta-llama/Llama-3.1-70B-Instruct";
        const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
          `https://api-inference.huggingface.co/v1/chat/completions`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: args.prompt }],
              max_tokens: 4096,
            }),
          }
        );
        return { success: true, output: result.choices[0]?.message?.content || "", data: result };
      }
      case "huggingface_list_models": {
        const result = await this.apiFetch<{ id: string; likes: number }[]>(
          `https://huggingface.co/api/models?search=${encodeURIComponent(args.query as string)}&sort=likes&direction=-1&limit=10`,
          { headers: { Authorization: `Bearer ${this.config.apiKey}` } }
        );
        const list = result.map((m) => `${m.id} (${m.likes} likes)`).join("\n");
        return { success: true, output: `Models matching "${args.query}":\n${list}`, data: result };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
