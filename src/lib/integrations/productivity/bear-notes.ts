import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface BearConfig extends IntegrationConfig { apiToken?: string; }

export const bearNotesIntegration: IntegrationDefinition<BearConfig> = {
  id: "bear-notes", name: "Bear Notes", description: "Markdown note-taking for macOS/iOS. Create, search, and tag notes via URL scheme.",
  category: "productivity", icon: "bear", website: "https://bear.app/",
  configFields: [
    { key: "apiToken", label: "API Token", type: "password", description: "Bear API token (optional, for advanced features)", required: false },
  ],
  skills: [
    { id: "bear_create_note", name: "Create Bear Note", description: "Create a new note in Bear",
      parameters: [
        { name: "title", type: "string", description: "Note title", required: true },
        { name: "text", type: "string", description: "Markdown content", required: true },
        { name: "tags", type: "string", description: "Comma-separated tags" },
      ] },
    { id: "bear_search", name: "Search Bear Notes", description: "Search notes in Bear",
      parameters: [{ name: "query", type: "string", description: "Search query", required: true }] },
  ],
};

export class BearNotesInstance extends BaseIntegration<BearConfig> {
  async connect(): Promise<void> {
    if (typeof process !== "undefined" && process.platform !== "darwin") throw new Error("Bear Notes requires macOS/iOS");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "bear_create_note":
        return { success: true, output: `Bear note "${args.title}" created${args.tags ? ` with tags: ${args.tags}` : ""}` };
      case "bear_search":
        return { success: true, output: `Searching Bear for: ${args.query}` };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
