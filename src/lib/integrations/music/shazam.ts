import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface ShazamConfig extends IntegrationConfig { rapidApiKey: string; }

export const shazamIntegration: IntegrationDefinition<ShazamConfig> = {
  id: "shazam", name: "Shazam", description: "Song identification and recognition. Identify music from audio samples.",
  category: "music", icon: "shazam", website: "https://www.shazam.com/",
  configFields: [
    { key: "rapidApiKey", label: "RapidAPI Key", type: "password", description: "RapidAPI key for Shazam API", required: true },
  ],
  skills: [
    { id: "shazam_search", name: "Search Songs", description: "Search for songs on Shazam",
      parameters: [{ name: "query", type: "string", description: "Song or artist name", required: true }] },
  ],
};

export class ShazamInstance extends BaseIntegration<ShazamConfig> {
  async connect(): Promise<void> { this.status = "connected"; }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "shazam_search") {
      const result = await this.apiFetch<{ tracks: { hits: { track: { title: string; subtitle: string } }[] } }>(
        `https://shazam.p.rapidapi.com/search?term=${encodeURIComponent(args.query as string)}`,
        { headers: { "X-RapidAPI-Key": this.config.rapidApiKey, "X-RapidAPI-Host": "shazam.p.rapidapi.com" } }
      );
      const hits = result.tracks?.hits?.slice(0, 5) || [];
      return { success: true, output: hits.map((h) => `${h.track.title} — ${h.track.subtitle}`).join("\n") || "No results", data: hits };
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
