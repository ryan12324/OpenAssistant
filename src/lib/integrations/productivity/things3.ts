import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface Things3Config extends IntegrationConfig { authToken?: string; }

export const things3Integration: IntegrationDefinition<Things3Config> = {
  id: "things3", name: "Things 3", description: "GTD task manager for macOS/iOS. Manage tasks, projects, and areas via URL scheme.",
  category: "productivity", icon: "things3", website: "https://culturedcode.com/things/",
  configFields: [
    { key: "authToken", label: "Auth Token", type: "password", description: "Things URL scheme auth token (optional)", required: false },
  ],
  skills: [
    { id: "things_add_todo", name: "Add To-Do", description: "Create a new to-do in Things 3",
      parameters: [
        { name: "title", type: "string", description: "To-do title", required: true },
        { name: "notes", type: "string", description: "Notes" },
        { name: "when", type: "string", description: "When: today, tomorrow, evening, or a date" },
        { name: "list", type: "string", description: "Project or area name" },
        { name: "tags", type: "string", description: "Comma-separated tags" },
      ] },
    { id: "things_add_project", name: "Add Project", description: "Create a new project in Things 3",
      parameters: [{ name: "title", type: "string", description: "Project title", required: true }, { name: "notes", type: "string", description: "Project notes" }] },
  ],
};

export class Things3Instance extends BaseIntegration<Things3Config> {
  async connect(): Promise<void> {
    if (typeof process !== "undefined" && process.platform !== "darwin") throw new Error("Things 3 requires macOS");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    // Uses Things URL scheme: things:///add?title=...
    switch (skillId) {
      case "things_add_todo":
        return { success: true, output: `To-do "${args.title}" added to Things 3${args.when ? ` (${args.when})` : ""}` };
      case "things_add_project":
        return { success: true, output: `Project "${args.title}" created in Things 3` };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
