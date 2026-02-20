import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface OllamaConfig extends IntegrationConfig {
  baseUrl: string;
  model: string;
}

export const ollamaIntegration: IntegrationDefinition<OllamaConfig> = {
  id: "ollama",
  name: "Ollama (Local)",
  description: "Run local LLMs with Ollama. Full privacy — no data leaves your machine.",
  category: "ai",
  icon: "ollama",
  website: "https://ollama.ai/",
  configFields: [
    { key: "baseUrl", label: "Base URL", type: "text", description: "Ollama server URL", required: true, default: "http://localhost:11434" },
    { key: "model", label: "Model", type: "text", description: "Model name (e.g., llama3.1, mistral)", required: true, default: "llama3.1" },
  ],
  skills: [
    {
      id: "ollama_complete",
      name: "Local Completion",
      description: "Generate a completion using a local Ollama model",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt", required: true },
        { name: "model", type: "string", description: "Model override" },
      ],
    },
    {
      id: "ollama_list_models",
      name: "List Local Models",
      description: "List available Ollama models",
      parameters: [],
    },
  ],
};

export class OllamaInstance extends BaseIntegration<OllamaConfig> {
  async connect(): Promise<void> {
    const result = await this.apiFetch<{ models: unknown[] }>(`${this.config.baseUrl}/api/tags`);
    if (!result.models) throw new Error("Cannot connect to Ollama");
    this.status = "connected";
  }

  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "ollama_complete": {
        const result = await this.apiFetch<{ response: string }>(
          `${this.config.baseUrl}/api/generate`,
          { method: "POST", body: JSON.stringify({ model: args.model || this.config.model, prompt: args.prompt, stream: false }) }
        );
        return { success: true, output: result.response, data: result };
      }
      case "ollama_list_models": {
        const result = await this.apiFetch<{ models: { name: string; size: number }[] }>(`${this.config.baseUrl}/api/tags`);
        const list = result.models.map((m) => `${m.name} (${(m.size / 1e9).toFixed(1)}GB)`).join("\n");
        return { success: true, output: `Available models:\n${list}`, data: result.models };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
