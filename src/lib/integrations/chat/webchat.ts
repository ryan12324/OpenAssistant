import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface WebChatConfig extends IntegrationConfig {
  enabled: boolean;
}

export const webchatIntegration: IntegrationDefinition<WebChatConfig> = {
  id: "webchat",
  name: "WebChat",
  description: "Built-in browser-based chat interface. Always available as the primary interaction method.",
  category: "chat",
  icon: "webchat",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "enabled",
      label: "Enabled",
      type: "boolean",
      description: "Enable the built-in web chat interface",
      required: false,
      default: true,
    },
  ],
  skills: [],
};

export class WebChatInstance extends BaseIntegration<WebChatConfig> {
  async connect(): Promise<void> {
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  protected async handleSkill(
    _skillId: string,
    _args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string }> {
    return { success: true, output: "WebChat is always available" };
  }
}
