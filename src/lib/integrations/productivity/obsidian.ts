import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface ObsidianConfig extends IntegrationConfig { apiUrl: string; apiKey: string; }

export const obsidianIntegration: IntegrationDefinition<ObsidianConfig> = {
  id: "obsidian", name: "Obsidian", description: "Knowledge graph note system via Obsidian Local REST API plugin.",
  category: "productivity", icon: "obsidian", website: "https://obsidian.md/",
  configFields: [
    { key: "apiUrl", label: "API URL", type: "text", description: "Obsidian Local REST API URL", required: true, default: "https://localhost:27124" },
    { key: "apiKey", label: "API Key", type: "password", description: "REST API key from the plugin settings", required: true },
  ],
  skills: [
    { id: "obsidian_search", name: "Search Notes", description: "Search Obsidian vault notes", parameters: [{ name: "query", type: "string", description: "Search query", required: true }] },
    { id: "obsidian_create_note", name: "Create Note", description: "Create a new note in Obsidian",
      parameters: [{ name: "path", type: "string", description: "Note path (e.g., folder/note.md)", required: true }, { name: "content", type: "string", description: "Markdown content", required: true }] },
    { id: "obsidian_read_note", name: "Read Note", description: "Read an existing note",
      parameters: [{ name: "path", type: "string", description: "Note path", required: true }] },
    { id: "obsidian_append_note", name: "Append to Note", description: "Append content to an existing note",
      parameters: [{ name: "path", type: "string", description: "Note path", required: true }, { name: "content", type: "string", description: "Content to append", required: true }] },
  ],
};

export class ObsidianInstance extends BaseIntegration<ObsidianConfig> {
  private get headers() { return { Authorization: `Bearer ${this.config.apiKey}` }; }

  async connect(): Promise<void> {
    await this.apiFetch(`${this.config.apiUrl}/`, { headers: this.headers });
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "obsidian_search": {
        const result = await this.apiFetch<{ filename: string; score: number }[]>(
          `${this.config.apiUrl}/search/simple/?query=${encodeURIComponent(args.query as string)}`, { headers: this.headers }
        );
        const list = result.map((r) => `${r.filename} (score: ${r.score.toFixed(2)})`).join("\n");
        return { success: true, output: `Search results:\n${list}`, data: result };
      }
      case "obsidian_create_note": {
        await this.apiFetch(`${this.config.apiUrl}/vault/${args.path}`, {
          method: "PUT", headers: { ...this.headers, "Content-Type": "text/markdown" }, body: args.content as string,
        });
        return { success: true, output: `Note created: ${args.path}` };
      }
      case "obsidian_read_note": {
        const content = await fetch(`${this.config.apiUrl}/vault/${args.path}`, { headers: this.headers }).then((r) => r.text());
        return { success: true, output: content };
      }
      case "obsidian_append_note": {
        await this.apiFetch(`${this.config.apiUrl}/vault/${args.path}`, {
          method: "POST", headers: { ...this.headers, "Content-Type": "text/markdown" }, body: args.content as string,
        });
        return { success: true, output: `Content appended to: ${args.path}` };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
