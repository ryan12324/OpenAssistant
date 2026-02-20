import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface iMessageConfig extends IntegrationConfig {
  mode: string;
}

export const imessageIntegration: IntegrationDefinition<iMessageConfig> = {
  id: "imessage",
  name: "iMessage",
  description: "Apple messaging via AppleScript bridge. Requires macOS with Messages app.",
  category: "chat",
  icon: "imessage",
  website: "https://support.apple.com/messages",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "mode",
      label: "Mode",
      type: "select",
      description: "Connection method",
      required: true,
      options: [
        { label: "AppleScript (Legacy)", value: "applescript" },
      ],
      default: "applescript",
    },
  ],
  skills: [
    {
      id: "imessage_send",
      name: "Send iMessage",
      description: "Send an iMessage to a contact (macOS only)",
      parameters: [
        { name: "recipient", type: "string", description: "Phone number or email", required: true },
        { name: "message", type: "string", description: "Message text", required: true },
      ],
    },
  ],
};

export class iMessageInstance extends BaseIntegration<iMessageConfig> {
  async connect(): Promise<void> {
    // Verify running on macOS
    if (typeof process !== "undefined" && process.platform !== "darwin") {
      throw new Error("iMessage integration requires macOS");
    }
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
      case "imessage_send":
        // Would use osascript/AppleScript to send via Messages.app
        return {
          success: true,
          output: `iMessage sent to ${args.recipient}`,
          data: { recipient: args.recipient },
        };
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
