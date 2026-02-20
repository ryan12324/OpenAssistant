import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface HAConfig extends IntegrationConfig { url: string; token: string; }

export const homeAssistantIntegration: IntegrationDefinition<HAConfig> = {
  id: "home-assistant", name: "Home Assistant", description: "Home automation hub. Control any device, trigger automations, monitor sensors.",
  category: "smart-home", icon: "home-assistant", website: "https://www.home-assistant.io/",
  configFields: [
    { key: "url", label: "URL", type: "text", description: "Home Assistant URL", required: true, placeholder: "http://homeassistant.local:8123" },
    { key: "token", label: "Long-Lived Access Token", type: "password", description: "HA long-lived access token", required: true },
  ],
  skills: [
    { id: "ha_list_entities", name: "List Entities", description: "List Home Assistant entities",
      parameters: [{ name: "domain", type: "string", description: "Filter by domain (light, switch, sensor, etc.)" }] },
    { id: "ha_get_state", name: "Get State", description: "Get the state of an entity",
      parameters: [{ name: "entity_id", type: "string", description: "Entity ID (e.g., light.living_room)", required: true }] },
    { id: "ha_call_service", name: "Call Service", description: "Call a Home Assistant service",
      parameters: [
        { name: "domain", type: "string", description: "Service domain (e.g., light)", required: true },
        { name: "service", type: "string", description: "Service name (e.g., turn_on)", required: true },
        { name: "entity_id", type: "string", description: "Target entity ID", required: true },
        { name: "data", type: "string", description: "JSON service data (optional)" },
      ] },
    { id: "ha_trigger_automation", name: "Trigger Automation", description: "Trigger a Home Assistant automation",
      parameters: [{ name: "entity_id", type: "string", description: "Automation entity ID", required: true }] },
  ],
};

export class HomeAssistantInstance extends BaseIntegration<HAConfig> {
  private get headers() { return { Authorization: `Bearer ${this.config.token}` }; }

  async connect(): Promise<void> {
    const res = await this.apiFetch<{ message: string }>(`${this.config.url}/api/`, { headers: this.headers });
    if (!res.message) throw new Error("Cannot connect to Home Assistant");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "ha_list_entities": {
        const states = await this.apiFetch<{ entity_id: string; state: string }[]>(`${this.config.url}/api/states`, { headers: this.headers });
        const filtered = args.domain ? states.filter((s) => s.entity_id.startsWith(`${args.domain}.`)) : states;
        const list = filtered.slice(0, 30).map((s) => `${s.entity_id}: ${s.state}`).join("\n");
        return { success: true, output: `Entities (${filtered.length}):\n${list}`, data: filtered };
      }
      case "ha_get_state": {
        const state = await this.apiFetch<{ entity_id: string; state: string; attributes: Record<string, unknown> }>(
          `${this.config.url}/api/states/${args.entity_id}`, { headers: this.headers }
        );
        return { success: true, output: `${state.entity_id}: ${state.state}\nAttributes: ${JSON.stringify(state.attributes)}`, data: state };
      }
      case "ha_call_service": {
        const data = args.data ? JSON.parse(args.data as string) : {};
        await this.apiFetch(`${this.config.url}/api/services/${args.domain}/${args.service}`, {
          method: "POST", headers: this.headers, body: JSON.stringify({ entity_id: args.entity_id, ...data }),
        });
        return { success: true, output: `Service ${args.domain}.${args.service} called on ${args.entity_id}` };
      }
      case "ha_trigger_automation": {
        await this.apiFetch(`${this.config.url}/api/services/automation/trigger`, {
          method: "POST", headers: this.headers, body: JSON.stringify({ entity_id: args.entity_id }),
        });
        return { success: true, output: `Automation triggered: ${args.entity_id}` };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
