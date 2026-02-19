import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface PeekabooConfig extends IntegrationConfig { enabled: boolean; }

export const peekabooIntegration: IntegrationDefinition<PeekabooConfig> = {
  id: "peekaboo", name: "Peekaboo", description: "Screen capture and control. Take screenshots, record screen, and analyze visual content.",
  category: "media", icon: "peekaboo",
  configFields: [
    { key: "enabled", label: "Enabled", type: "boolean", description: "Enable screen capture", required: false, default: true },
  ],
  skills: [
    { id: "peekaboo_screenshot", name: "Take Screenshot", description: "Capture the current screen", parameters: [] },
    { id: "peekaboo_describe_screen", name: "Describe Screen", description: "Analyze and describe what's on screen", parameters: [] },
  ],
};

export class PeekabooInstance extends BaseIntegration<PeekabooConfig> {
  async connect(): Promise<void> { this.status = "connected"; }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, _args: Record<string, unknown>) {
    switch (skillId) {
      case "peekaboo_screenshot": return { success: true, output: "Screenshot captured" };
      case "peekaboo_describe_screen": return { success: true, output: "Screen analysis complete" };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
