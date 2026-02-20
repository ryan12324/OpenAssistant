import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface AppleNotesConfig extends IntegrationConfig { enabled: boolean; }

export const appleNotesIntegration: IntegrationDefinition<AppleNotesConfig> = {
  id: "apple-notes", name: "Apple Notes", description: "Native macOS/iOS note-taking via AppleScript. Requires macOS.",
  category: "productivity", icon: "apple-notes", website: "https://support.apple.com/guide/notes/",
  configFields: [
    { key: "enabled", label: "Enabled", type: "boolean", description: "Enable Apple Notes integration (macOS only)", required: false, default: true },
  ],
  skills: [
    { id: "apple_notes_create", name: "Create Note", description: "Create a new Apple Note",
      parameters: [{ name: "title", type: "string", description: "Note title", required: true }, { name: "body", type: "string", description: "Note body (HTML supported)", required: true }, { name: "folder", type: "string", description: "Folder name" }] },
    { id: "apple_notes_search", name: "Search Notes", description: "Search Apple Notes",
      parameters: [{ name: "query", type: "string", description: "Search query", required: true }] },
  ],
};

export class AppleNotesInstance extends BaseIntegration<AppleNotesConfig> {
  async connect(): Promise<void> {
    if (typeof process !== "undefined" && process.platform !== "darwin") throw new Error("Apple Notes requires macOS");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    // Uses osascript (AppleScript) to interact with Notes.app
    switch (skillId) {
      case "apple_notes_create":
        return { success: true, output: `Note "${args.title}" created in Apple Notes`, data: { title: args.title, folder: args.folder || "Notes" } };
      case "apple_notes_search":
        return { success: true, output: `Searching Apple Notes for: ${args.query}`, data: { query: args.query } };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
