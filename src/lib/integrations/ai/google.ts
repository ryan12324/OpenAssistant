import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface GoogleConfig extends IntegrationConfig {
  apiKey: string;
  model?: string;
}

export const googleIntegration: IntegrationDefinition<GoogleConfig> = {
  id: "google-ai",
  name: "Google AI",
  description: "Gemini 2.5 Pro and Flash models. Multimodal with large context windows.",
  category: "ai",
  icon: "google",
  website: "https://ai.google.dev/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "Google AI API key", required: true },
    { key: "model", label: "Default Model", type: "select", description: "Default model", required: false, options: [
      { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
      { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
    ], default: "gemini-2.5-flash" },
  ],
  skills: [
    {
      id: "google_complete",
      name: "Google AI Completion",
      description: "Generate a response using Gemini models",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt", required: true },
        { name: "model", type: "string", description: "Model override" },
      ],
    },
  ],
};

export class GoogleAIInstance extends BaseIntegration<GoogleConfig> {
  async connect(): Promise<void> {
    const model = this.config.model || "gemini-2.5-flash";
    const result = await this.apiFetch<{ candidates: unknown[] }>(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`,
      { method: "POST", body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }) }
    );
    if (result.candidates) this.status = "connected";
  }

  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    const model = (args.model as string) || this.config.model || "gemini-2.5-flash";
    switch (skillId) {
      case "google_complete": {
        const result = await this.apiFetch<{ candidates: { content: { parts: { text: string }[] } }[] }>(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`,
          { method: "POST", body: JSON.stringify({ contents: [{ parts: [{ text: args.prompt }] }] }) }
        );
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return { success: true, output: text, data: result };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
