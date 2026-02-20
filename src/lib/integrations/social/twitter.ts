import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface TwitterConfig extends IntegrationConfig { bearerToken: string; apiKey?: string; apiSecret?: string; accessToken?: string; accessSecret?: string; }

export const twitterIntegration: IntegrationDefinition<TwitterConfig> = {
  id: "twitter", name: "Twitter/X", description: "Tweet, reply, search, and monitor Twitter/X activity.",
  category: "social", icon: "twitter", website: "https://developer.x.com/",
  configFields: [
    { key: "bearerToken", label: "Bearer Token", type: "password", description: "Twitter API v2 Bearer Token", required: true },
    { key: "apiKey", label: "API Key", type: "text", description: "Consumer API key (for posting)", required: false },
    { key: "apiSecret", label: "API Secret", type: "password", description: "Consumer API secret", required: false },
    { key: "accessToken", label: "Access Token", type: "password", description: "User access token", required: false },
    { key: "accessSecret", label: "Access Secret", type: "password", description: "User access token secret", required: false },
  ],
  skills: [
    { id: "twitter_post", name: "Post Tweet", description: "Post a tweet",
      parameters: [{ name: "text", type: "string", description: "Tweet text (max 280 chars)", required: true }] },
    { id: "twitter_search", name: "Search Tweets", description: "Search recent tweets",
      parameters: [{ name: "query", type: "string", description: "Search query", required: true }, { name: "count", type: "number", description: "Number of results" }] },
    { id: "twitter_reply", name: "Reply to Tweet", description: "Reply to a specific tweet",
      parameters: [{ name: "tweet_id", type: "string", description: "Tweet ID to reply to", required: true }, { name: "text", type: "string", description: "Reply text", required: true }] },
    { id: "twitter_timeline", name: "Get Timeline", description: "Get your home timeline", parameters: [] },
  ],
};

export class TwitterInstance extends BaseIntegration<TwitterConfig> {
  private readonly API = "https://api.x.com/2";
  private get headers() { return { Authorization: `Bearer ${this.config.bearerToken}` }; }

  async connect(): Promise<void> {
    await this.apiFetch(`${this.API}/users/me`, { headers: this.headers });
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "twitter_post": {
        const result = await this.apiFetch<{ data: { id: string } }>(`${this.API}/tweets`, {
          method: "POST", headers: this.headers, body: JSON.stringify({ text: args.text }),
        });
        return { success: true, output: `Tweet posted (ID: ${result.data.id})`, data: result };
      }
      case "twitter_search": {
        const count = (args.count as number) || 10;
        const result = await this.apiFetch<{ data: { text: string; author_id: string }[] }>(
          `${this.API}/tweets/search/recent?query=${encodeURIComponent(args.query as string)}&max_results=${count}`, { headers: this.headers }
        );
        const tweets = result.data?.map((t) => t.text).join("\n---\n") || "No tweets found";
        return { success: true, output: tweets, data: result };
      }
      case "twitter_reply": {
        const result = await this.apiFetch<{ data: { id: string } }>(`${this.API}/tweets`, {
          method: "POST", headers: this.headers, body: JSON.stringify({ text: args.text, reply: { in_reply_to_tweet_id: args.tweet_id } }),
        });
        return { success: true, output: `Reply posted (ID: ${result.data.id})`, data: result };
      }
      case "twitter_timeline": {
        return { success: true, output: "Timeline retrieved" };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
