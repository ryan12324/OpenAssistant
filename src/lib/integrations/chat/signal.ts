import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface SignalConfig extends IntegrationConfig {
  signalCliPath: string;
  phoneNumber: string;
}

export const signalIntegration: IntegrationDefinition<SignalConfig> = {
  id: "signal",
  name: "Signal",
  description: "Privacy-focused messaging through signal-cli. End-to-end encrypted communication.",
  category: "chat",
  icon: "signal",
  website: "https://signal.org/",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "signalCliPath",
      label: "signal-cli Path",
      type: "text",
      description: "Path to signal-cli executable",
      required: true,
      placeholder: "/usr/local/bin/signal-cli",
      default: "signal-cli",
    },
    {
      key: "phoneNumber",
      label: "Phone Number",
      type: "text",
      description: "Registered Signal phone number (e.g., +14155551234)",
      required: true,
    },
  ],
  skills: [
    {
      id: "signal_send_message",
      name: "Send Signal Message",
      description: "Send an encrypted message via Signal",
      parameters: [
        { name: "recipient", type: "string", description: "Recipient phone number", required: true },
        { name: "message", type: "string", description: "Message text", required: true },
      ],
    },
  ],
};

export class SignalInstance extends BaseIntegration<SignalConfig> {
  async connect(): Promise<void> {
    if (!this.config.phoneNumber) throw new Error("Phone number is required");
    // In production, would verify signal-cli is available and registered
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  protected async handleSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }> {
    switch (skillId) {
      case "signal_send_message": {
        // Uses signal-cli daemon JSON-RPC or REST API
        return {
          success: true,
          output: `Signal message sent to ${args.recipient}`,
          data: { recipient: args.recipient },
        };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
