import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface TrelloConfig extends IntegrationConfig { apiKey: string; token: string; }

export const trelloIntegration: IntegrationDefinition<TrelloConfig> = {
  id: "trello", name: "Trello", description: "Kanban board management. Create cards, move between lists, manage boards.",
  category: "productivity", icon: "trello", website: "https://developer.atlassian.com/cloud/trello/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "text", description: "Trello API key", required: true },
    { key: "token", label: "Token", type: "password", description: "Trello auth token", required: true },
  ],
  skills: [
    { id: "trello_list_boards", name: "List Boards", description: "List your Trello boards", parameters: [] },
    { id: "trello_create_card", name: "Create Card", description: "Create a card on a Trello board",
      parameters: [
        { name: "list_id", type: "string", description: "List ID to add card to", required: true },
        { name: "name", type: "string", description: "Card title", required: true },
        { name: "desc", type: "string", description: "Card description" },
      ] },
    { id: "trello_move_card", name: "Move Card", description: "Move a card to a different list",
      parameters: [
        { name: "card_id", type: "string", description: "Card ID", required: true },
        { name: "list_id", type: "string", description: "Target list ID", required: true },
      ] },
  ],
};

export class TrelloInstance extends BaseIntegration<TrelloConfig> {
  private readonly API = "https://api.trello.com/1";
  private get auth() { return `key=${this.config.apiKey}&token=${this.config.token}`; }

  async connect(): Promise<void> {
    await this.apiFetch(`${this.API}/members/me?${this.auth}`);
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "trello_list_boards": {
        const boards = await this.apiFetch<{ id: string; name: string }[]>(`${this.API}/members/me/boards?${this.auth}`);
        return { success: true, output: boards.map((b) => `${b.name} (${b.id})`).join("\n"), data: boards };
      }
      case "trello_create_card": {
        const card = await this.apiFetch<{ id: string; shortUrl: string }>(
          `${this.API}/cards?${this.auth}`, { method: "POST", body: JSON.stringify({ idList: args.list_id, name: args.name, desc: args.desc }) }
        );
        return { success: true, output: `Card created: ${card.shortUrl}`, data: card };
      }
      case "trello_move_card": {
        await this.apiFetch(`${this.API}/cards/${args.card_id}?${this.auth}`, { method: "PUT", body: JSON.stringify({ idList: args.list_id }) });
        return { success: true, output: "Card moved successfully" };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
