import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface EightSleepConfig extends IntegrationConfig { email: string; password: string; }

export const eightSleepIntegration: IntegrationDefinition<EightSleepConfig> = {
  id: "8sleep", name: "8Sleep", description: "Smart mattress management. Monitor sleep data and adjust bed temperature.",
  category: "smart-home", icon: "8sleep", website: "https://www.eightsleep.com/",
  configFields: [
    { key: "email", label: "Email", type: "text", description: "8Sleep account email", required: true },
    { key: "password", label: "Password", type: "password", description: "8Sleep account password", required: true },
  ],
  skills: [
    { id: "8sleep_status", name: "Bed Status", description: "Get current bed temperature and status", parameters: [] },
    { id: "8sleep_set_temp", name: "Set Temperature", description: "Set bed temperature level",
      parameters: [{ name: "level", type: "number", description: "Temperature level (-10 to +10)", required: true }, { name: "side", type: "string", description: "Bed side: left or right", required: true }] },
    { id: "8sleep_sleep_data", name: "Sleep Data", description: "Get last night's sleep data", parameters: [] },
  ],
};

export class EightSleepInstance extends BaseIntegration<EightSleepConfig> {
  async connect(): Promise<void> {
    if (!this.config.email || !this.config.password) throw new Error("Credentials required");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "8sleep_status": return { success: true, output: "Bed status retrieved" };
      case "8sleep_set_temp": return { success: true, output: `Temperature set to ${args.level} on ${args.side} side` };
      case "8sleep_sleep_data": return { success: true, output: "Sleep data retrieved" };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
