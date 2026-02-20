import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface GifSearchConfig extends IntegrationConfig { apiKey: string; }

export const gifSearchIntegration: IntegrationDefinition<GifSearchConfig> = {
  id: "gif-search", name: "GIF Search", description: "GIF discovery via Tenor/GIPHY. Search and share animated GIFs.",
  category: "media", icon: "gif",
  configFields: [
    { key: "apiKey", label: "Tenor API Key", type: "password", description: "Google Tenor API key", required: true },
  ],
  skills: [
    { id: "gif_search", name: "Search GIFs", description: "Search for GIFs",
      parameters: [{ name: "query", type: "string", description: "Search query", required: true }, { name: "limit", type: "number", description: "Number of results (default 5)" }] },
  ],
};

export class GifSearchInstance extends BaseIntegration<GifSearchConfig> {
  async connect(): Promise<void> { this.status = "connected"; }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "gif_search") {
      const limit = (args.limit as number) || 5;
      const result = await this.apiFetch<{ results: { media_formats: { gif: { url: string } }; content_description: string }[] }>(
        `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(args.query as string)}&key=${this.config.apiKey}&limit=${limit}`
      );
      const gifs = result.results.map((r) => `${r.content_description}: ${r.media_formats.gif.url}`).join("\n");
      return { success: true, output: gifs || "No GIFs found", data: result.results };
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
