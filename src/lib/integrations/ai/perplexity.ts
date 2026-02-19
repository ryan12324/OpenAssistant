import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface PerplexityConfig extends IntegrationConfig { apiKey: string; }

export const perplexityIntegration: IntegrationDefinition<PerplexityConfig> = {
  id: "perplexity", name: "Perplexity", description: "Search-augmented AI. Get answers grounded in real-time web search.",
  category: "ai", icon: "perplexity", website: "https://docs.perplexity.ai/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "Perplexity API key", required: true },
  ],
  skills: [{
    id: "perplexity_search", name: "Perplexity Search", description: "Search the web with AI-powered answers and citations",
    parameters: [{ name: "query", type: "string", description: "Search query", required: true }],
  }],
};

export class PerplexityInstance extends BaseIntegration<PerplexityConfig> {
  async connect(): Promise<void> {
    this.status = "connected"; // Perplexity validates on first request
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }
  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "perplexity_search") {
      const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
        "https://api.perplexity.ai/chat/completions",
        { method: "POST", headers: { Authorization: `Bearer ${this.config.apiKey}` },
          body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: args.query }] }) }
      );
      return { success: true, output: result.choices[0]?.message?.content || "", data: result };
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
