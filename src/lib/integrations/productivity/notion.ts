import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface NotionConfig extends IntegrationConfig { apiKey: string; }

export const notionIntegration: IntegrationDefinition<NotionConfig> = {
  id: "notion", name: "Notion", description: "Workspace and database integration. Create pages, query databases, manage content.",
  category: "productivity", icon: "notion", website: "https://developers.notion.com/",
  configFields: [
    { key: "apiKey", label: "Integration Token", type: "password", description: "Notion internal integration token", required: true, placeholder: "ntn_..." },
  ],
  skills: [
    { id: "notion_search", name: "Search Notion", description: "Search pages and databases in Notion",
      parameters: [{ name: "query", type: "string", description: "Search query", required: true }] },
    { id: "notion_create_page", name: "Create Notion Page", description: "Create a new page in a Notion database",
      parameters: [
        { name: "database_id", type: "string", description: "Parent database ID", required: true },
        { name: "title", type: "string", description: "Page title", required: true },
        { name: "content", type: "string", description: "Page content (markdown)" },
      ] },
    { id: "notion_query_database", name: "Query Database", description: "Query a Notion database",
      parameters: [{ name: "database_id", type: "string", description: "Database ID", required: true }] },
  ],
};

export class NotionInstance extends BaseIntegration<NotionConfig> {
  private get headers() { return { Authorization: `Bearer ${this.config.apiKey}`, "Notion-Version": "2022-06-28" }; }
  private readonly API = "https://api.notion.com/v1";

  async connect(): Promise<void> {
    await this.apiFetch(`${this.API}/users/me`, { headers: this.headers });
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "notion_search": {
        const result = await this.apiFetch<{ results: { id: string; object: string; properties?: Record<string, unknown> }[] }>(
          `${this.API}/search`, { method: "POST", headers: this.headers, body: JSON.stringify({ query: args.query }) }
        );
        const list = result.results.slice(0, 10).map((r) => `[${r.object}] ${r.id}`).join("\n");
        return { success: true, output: `Found ${result.results.length} results:\n${list}`, data: result.results };
      }
      case "notion_create_page": {
        const result = await this.apiFetch<{ id: string; url: string }>(
          `${this.API}/pages`, {
            method: "POST", headers: this.headers,
            body: JSON.stringify({
              parent: { database_id: args.database_id },
              properties: { title: { title: [{ text: { content: args.title } }] } },
              children: args.content ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: args.content } }] } }] : [],
            }),
          }
        );
        return { success: true, output: `Page created: ${result.url}`, data: result };
      }
      case "notion_query_database": {
        const result = await this.apiFetch<{ results: unknown[] }>(
          `${this.API}/databases/${args.database_id}/query`, { method: "POST", headers: this.headers, body: JSON.stringify({}) }
        );
        return { success: true, output: `Found ${result.results.length} entries`, data: result.results };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
