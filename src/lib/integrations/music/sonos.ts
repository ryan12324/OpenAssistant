import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface SonosConfig extends IntegrationConfig { apiKey: string; householdId?: string; }

export const sonosIntegration: IntegrationDefinition<SonosConfig> = {
  id: "sonos", name: "Sonos", description: "Multi-room audio system management. Control playback across Sonos speakers.",
  category: "music", icon: "sonos", website: "https://developer.sonos.com/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "Sonos Developer API key / access token", required: true },
    { key: "householdId", label: "Household ID", type: "text", description: "Sonos household ID", required: false },
  ],
  skills: [
    { id: "sonos_play", name: "Play on Sonos", description: "Start playback on a Sonos group",
      parameters: [{ name: "group_id", type: "string", description: "Sonos group ID", required: true }] },
    { id: "sonos_pause", name: "Pause Sonos", description: "Pause playback",
      parameters: [{ name: "group_id", type: "string", description: "Sonos group ID", required: true }] },
    { id: "sonos_volume", name: "Set Volume", description: "Set volume on a Sonos group",
      parameters: [{ name: "group_id", type: "string", description: "Group ID", required: true }, { name: "volume", type: "number", description: "Volume level (0-100)", required: true }] },
    { id: "sonos_list_groups", name: "List Groups", description: "List Sonos speaker groups", parameters: [] },
  ],
};

export class SonosInstance extends BaseIntegration<SonosConfig> {
  private readonly API = "https://api.ws.sonos.com/control/api/v1";
  private get headers() { return { Authorization: `Bearer ${this.config.apiKey}` }; }

  async connect(): Promise<void> {
    await this.apiFetch(`${this.API}/households`, { headers: this.headers });
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "sonos_play": { await this.apiFetch(`${this.API}/groups/${args.group_id}/playback/play`, { method: "POST", headers: this.headers }); return { success: true, output: "Playback started" }; }
      case "sonos_pause": { await this.apiFetch(`${this.API}/groups/${args.group_id}/playback/pause`, { method: "POST", headers: this.headers }); return { success: true, output: "Playback paused" }; }
      case "sonos_volume": { await this.apiFetch(`${this.API}/groups/${args.group_id}/groupVolume`, { method: "POST", headers: this.headers, body: JSON.stringify({ volume: args.volume }) }); return { success: true, output: `Volume set to ${args.volume}` }; }
      case "sonos_list_groups": {
        const data = await this.apiFetch<{ households: { id: string }[] }>(`${this.API}/households`, { headers: this.headers });
        return { success: true, output: `Found ${data.households.length} households`, data };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
