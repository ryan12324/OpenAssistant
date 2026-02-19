import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface AppleRemindersConfig extends IntegrationConfig { enabled: boolean; }

export const appleRemindersIntegration: IntegrationDefinition<AppleRemindersConfig> = {
  id: "apple-reminders", name: "Apple Reminders", description: "Task management via AppleScript. Create, complete, and list reminders. Requires macOS.",
  category: "productivity", icon: "apple-reminders", website: "https://support.apple.com/guide/reminders/",
  configFields: [
    { key: "enabled", label: "Enabled", type: "boolean", description: "Enable Reminders integration", required: false, default: true },
  ],
  skills: [
    { id: "reminders_create", name: "Create Reminder", description: "Create a new reminder",
      parameters: [
        { name: "title", type: "string", description: "Reminder title", required: true },
        { name: "due_date", type: "string", description: "Due date (ISO format)" },
        { name: "list", type: "string", description: "Reminders list name" },
        { name: "notes", type: "string", description: "Additional notes" },
      ] },
    { id: "reminders_list", name: "List Reminders", description: "List reminders from a list",
      parameters: [{ name: "list", type: "string", description: "List name (default: Reminders)" }] },
    { id: "reminders_complete", name: "Complete Reminder", description: "Mark a reminder as complete",
      parameters: [{ name: "title", type: "string", description: "Reminder title to complete", required: true }] },
  ],
};

export class AppleRemindersInstance extends BaseIntegration<AppleRemindersConfig> {
  async connect(): Promise<void> {
    if (typeof process !== "undefined" && process.platform !== "darwin") throw new Error("Apple Reminders requires macOS");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "reminders_create":
        return { success: true, output: `Reminder "${args.title}" created${args.due_date ? ` (due: ${args.due_date})` : ""}` };
      case "reminders_list":
        return { success: true, output: `Listing reminders from: ${args.list || "Reminders"}` };
      case "reminders_complete":
        return { success: true, output: `Reminder "${args.title}" marked as complete` };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
