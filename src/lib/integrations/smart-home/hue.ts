import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface HueConfig extends IntegrationConfig { bridgeIp: string; apiKey: string; }

export const hueIntegration: IntegrationDefinition<HueConfig> = {
  id: "philips-hue", name: "Philips Hue", description: "Smart lighting control. Turn lights on/off, adjust brightness, change colors.",
  category: "smart-home", icon: "hue", website: "https://developers.meethue.com/",
  configFields: [
    { key: "bridgeIp", label: "Bridge IP", type: "text", description: "Hue Bridge IP address", required: true, placeholder: "192.168.1.100" },
    { key: "apiKey", label: "API Key", type: "password", description: "Hue Bridge API key (username)", required: true },
  ],
  skills: [
    { id: "hue_list_lights", name: "List Lights", description: "List all Hue lights", parameters: [] },
    { id: "hue_set_light", name: "Control Light", description: "Turn a light on/off or adjust it",
      parameters: [
        { name: "light_id", type: "string", description: "Light ID or name", required: true },
        { name: "on", type: "boolean", description: "Turn on (true) or off (false)" },
        { name: "brightness", type: "number", description: "Brightness 0-254" },
        { name: "color", type: "string", description: "Color name or hex value" },
      ] },
    { id: "hue_set_scene", name: "Set Scene", description: "Activate a Hue scene",
      parameters: [{ name: "scene_id", type: "string", description: "Scene ID", required: true }, { name: "group_id", type: "string", description: "Group/room ID", required: true }] },
  ],
};

export class HueInstance extends BaseIntegration<HueConfig> {
  private get base() { return `http://${this.config.bridgeIp}/api/${this.config.apiKey}`; }

  async connect(): Promise<void> {
    const lights = await this.apiFetch<Record<string, unknown>>(`${this.base}/lights`);
    if (typeof lights !== "object") throw new Error("Invalid Hue Bridge credentials");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "hue_list_lights": {
        const lights = await this.apiFetch<Record<string, { name: string; state: { on: boolean; bri: number } }>>(`${this.base}/lights`);
        const list = Object.entries(lights).map(([id, l]) => `${id}: ${l.name} (${l.state.on ? "ON" : "OFF"}, brightness: ${l.state.bri})`).join("\n");
        return { success: true, output: `Lights:\n${list}`, data: lights };
      }
      case "hue_set_light": {
        const state: Record<string, unknown> = {};
        if (args.on !== undefined) state.on = args.on;
        if (args.brightness !== undefined) state.bri = args.brightness;
        await this.apiFetch(`${this.base}/lights/${args.light_id}/state`, { method: "PUT", body: JSON.stringify(state) });
        return { success: true, output: `Light ${args.light_id} updated` };
      }
      case "hue_set_scene": {
        await this.apiFetch(`${this.base}/groups/${args.group_id}/action`, { method: "PUT", body: JSON.stringify({ scene: args.scene_id }) });
        return { success: true, output: "Scene activated" };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
