import type {
  IntegrationDefinition,
  IntegrationConfig,
  IntegrationInstance,
  IntegrationStatus,
} from "./types";
import { prisma } from "@/lib/prisma";

// Import all integration definitions
import { telegramIntegration, TelegramInstance } from "./chat/telegram";
import { discordIntegration, DiscordInstance } from "./chat/discord";
import { slackIntegration, SlackInstance } from "./chat/slack";
import { whatsappIntegration, WhatsAppInstance } from "./chat/whatsapp";
import { signalIntegration, SignalInstance } from "./chat/signal";
import { matrixIntegration, MatrixInstance } from "./chat/matrix";
import { teamsIntegration, TeamsInstance } from "./chat/teams";
import { webchatIntegration, WebChatInstance } from "./chat/webchat";
import { imessageIntegration, iMessageInstance } from "./chat/imessage";
import { blueBubblesIntegration, BlueBubblesInstance } from "./chat/bluebubbles";
import { nostrIntegration, NostrInstance } from "./chat/nostr";

import { openaiIntegration, OpenAIInstance } from "./ai/openai";
import { anthropicIntegration, AnthropicInstance } from "./ai/anthropic";
import { googleIntegration, GoogleAIInstance } from "./ai/google";
import { ollamaIntegration, OllamaInstance } from "./ai/ollama";
import { openrouterIntegration, OpenRouterInstance } from "./ai/openrouter";
import { mistralIntegration, MistralInstance } from "./ai/mistral";
import { deepseekIntegration, DeepSeekInstance } from "./ai/deepseek";
import { moonshotIntegration, MoonshotInstance } from "./ai/moonshot";
import { xaiIntegration, XAIInstance } from "./ai/xai";
import { perplexityIntegration, PerplexityInstance } from "./ai/perplexity";
import { minimaxIntegration, MiniMaxInstance } from "./ai/minimax";
import { glmIntegration, GLMInstance } from "./ai/glm";
import { huggingfaceIntegration, HuggingFaceInstance } from "./ai/huggingface";
import { lmstudioIntegration, LMStudioInstance } from "./ai/lmstudio";
import { vercelGatewayIntegration, VercelGatewayInstance } from "./ai/vercel-gateway";

import { notionIntegration, NotionInstance } from "./productivity/notion";
import { obsidianIntegration, ObsidianInstance } from "./productivity/obsidian";
import { githubIntegration, GitHubInstance } from "./productivity/github";
import { trelloIntegration, TrelloInstance } from "./productivity/trello";
import { appleNotesIntegration, AppleNotesInstance } from "./productivity/apple-notes";
import { appleRemindersIntegration, AppleRemindersInstance } from "./productivity/apple-reminders";
import { things3Integration, Things3Instance } from "./productivity/things3";
import { bearNotesIntegration, BearNotesInstance } from "./productivity/bear-notes";

import { browserIntegration, BrowserInstance } from "./tools/browser";
import { cronIntegration, CronInstance } from "./tools/cron";
import { webhooksIntegration, WebhooksInstance } from "./tools/webhooks";
import { gmailIntegration, GmailInstance } from "./tools/gmail";
import { weatherIntegration, WeatherInstance } from "./tools/weather";
import { onepasswordIntegration, OnePasswordInstance } from "./tools/onepassword";
import { voiceIntegration, VoiceInstance } from "./tools/voice";
import { canvasIntegration, CanvasInstance } from "./tools/canvas";

import { spotifyIntegration, SpotifyInstance } from "./music/spotify";
import { sonosIntegration, SonosInstance } from "./music/sonos";
import { shazamIntegration, ShazamInstance } from "./music/shazam";

import { hueIntegration, HueInstance } from "./smart-home/hue";
import { homeAssistantIntegration, HomeAssistantInstance } from "./smart-home/home-assistant";
import { eightSleepIntegration, EightSleepInstance } from "./smart-home/eightsleep";

import { imageGenIntegration, ImageGenInstance } from "./media/image-gen";
import { gifSearchIntegration, GifSearchInstance } from "./media/gif-search";
import { peekabooIntegration, PeekabooInstance } from "./media/peekaboo";

import { twitterIntegration, TwitterInstance } from "./social/twitter";
import { emailIntegration, EmailInstance } from "./social/email";

type InstanceConstructor = new (
  definition: IntegrationDefinition,
  config: IntegrationConfig
) => IntegrationInstance;

interface RegistryEntry {
  definition: IntegrationDefinition;
  instanceClass: InstanceConstructor;
}

class IntegrationRegistry {
  private integrations: Map<string, RegistryEntry> = new Map();
  private instances: Map<string, IntegrationInstance> = new Map();
  /** User-scoped instances keyed by "userId:integrationId" */
  private userInstances: Map<string, IntegrationInstance> = new Map();
  /** Track which users have been hydrated to avoid redundant DB queries */
  private hydratedUsers: Set<string> = new Set();

  register(definition: IntegrationDefinition, instanceClass: InstanceConstructor): void {
    this.integrations.set(definition.id, { definition, instanceClass });
  }

  getDefinition(id: string): IntegrationDefinition | undefined {
    return this.integrations.get(id)?.definition;
  }

  getAllDefinitions(): IntegrationDefinition[] {
    return Array.from(this.integrations.values()).map((e) => e.definition);
  }

  getByCategory(category: string): IntegrationDefinition[] {
    return this.getAllDefinitions().filter((d) => d.category === category);
  }

  /**
   * Create and connect an integration instance.
   */
  async createInstance(id: string, config: IntegrationConfig): Promise<IntegrationInstance> {
    const entry = this.integrations.get(id);
    if (!entry) throw new Error(`Integration "${id}" not found`);

    const instance = new entry.instanceClass(entry.definition, config);
    this.instances.set(id, instance);
    return instance;
  }

  /**
   * Create and connect a user-scoped integration instance.
   */
  async createUserInstance(
    userId: string,
    integrationId: string,
    config: IntegrationConfig
  ): Promise<IntegrationInstance> {
    const entry = this.integrations.get(integrationId);
    if (!entry) throw new Error(`Integration "${integrationId}" not found`);

    const key = `${userId}:${integrationId}`;
    const instance = new entry.instanceClass(entry.definition, config);
    this.userInstances.set(key, instance);
    return instance;
  }

  getInstance(id: string): IntegrationInstance | undefined {
    return this.instances.get(id);
  }

  getActiveInstances(): IntegrationInstance[] {
    return Array.from(this.instances.values()).filter(
      (i) => i.status === "connected"
    );
  }

  /**
   * Get active integration instances for a specific user.
   * Includes both user-scoped instances and global instances.
   */
  getActiveInstancesForUser(userId: string): IntegrationInstance[] {
    const result: IntegrationInstance[] = [];
    const seenIds = new Set<string>();

    // User-scoped instances first (take priority)
    for (const [key, instance] of this.userInstances) {
      if (key.startsWith(`${userId}:`) && instance.status === "connected") {
        result.push(instance);
        seenIds.add(instance.definition.id);
      }
    }

    // Global instances as fallback (for backwards compatibility)
    for (const instance of this.instances.values()) {
      if (instance.status === "connected" && !seenIds.has(instance.definition.id)) {
        result.push(instance);
      }
    }

    return result;
  }

  /**
   * Load a user's enabled integrations from the database and create/connect
   * instances. Skips integrations that are already active for the user.
   * Safe to call on every request — uses a hydration cache.
   */
  async hydrateUserIntegrations(userId: string): Promise<void> {
    if (this.hydratedUsers.has(userId)) return;

    try {
      const configs = await prisma.skillConfig.findMany({
        where: { userId, enabled: true },
      });

      for (const cfg of configs) {
        // Only hydrate integrations that have a registered definition
        if (!this.integrations.has(cfg.skillId)) continue;
        // Skip if already active for this user
        const key = `${userId}:${cfg.skillId}`;
        const existing = this.userInstances.get(key);
        if (existing && existing.status === "connected") continue;

        if (!cfg.config) continue;

        try {
          const config = JSON.parse(cfg.config) as IntegrationConfig;
          const instance = await this.createUserInstance(userId, cfg.skillId, config);
          await instance.connect();
        } catch (error) {
          console.error(
            `Failed to hydrate integration "${cfg.skillId}" for user ${userId}:`,
            error
          );
        }
      }

      this.hydratedUsers.add(userId);
    } catch (error) {
      console.error(`Failed to hydrate integrations for user ${userId}:`, error);
    }
  }

  /**
   * Clear hydration cache for a user so integrations are re-loaded on next request.
   * Call this when a user changes their integration config.
   */
  invalidateUser(userId: string): void {
    this.hydratedUsers.delete(userId);
    // Remove existing user instances so they're recreated
    for (const key of this.userInstances.keys()) {
      if (key.startsWith(`${userId}:`)) {
        const instance = this.userInstances.get(key);
        if (instance) {
          instance.disconnect().catch(() => {});
        }
        this.userInstances.delete(key);
      }
    }
  }

  async disconnectAll(): Promise<void> {
    for (const instance of this.instances.values()) {
      try {
        await instance.disconnect();
      } catch (e) {
        console.error(`Failed to disconnect ${instance.definition.id}:`, e);
      }
    }
    this.instances.clear();

    for (const instance of this.userInstances.values()) {
      try {
        await instance.disconnect();
      } catch (e) {
        console.error(`Failed to disconnect ${instance.definition.id}:`, e);
      }
    }
    this.userInstances.clear();
    this.hydratedUsers.clear();
  }
}

// Create and populate the global registry
export const integrationRegistry = new IntegrationRegistry();

// ── Chat Providers ──
integrationRegistry.register(telegramIntegration, TelegramInstance as unknown as InstanceConstructor);
integrationRegistry.register(discordIntegration, DiscordInstance as unknown as InstanceConstructor);
integrationRegistry.register(slackIntegration, SlackInstance as unknown as InstanceConstructor);
integrationRegistry.register(whatsappIntegration, WhatsAppInstance as unknown as InstanceConstructor);
integrationRegistry.register(signalIntegration, SignalInstance as unknown as InstanceConstructor);
integrationRegistry.register(matrixIntegration, MatrixInstance as unknown as InstanceConstructor);
integrationRegistry.register(teamsIntegration, TeamsInstance as unknown as InstanceConstructor);
integrationRegistry.register(webchatIntegration, WebChatInstance as unknown as InstanceConstructor);
integrationRegistry.register(imessageIntegration, iMessageInstance as unknown as InstanceConstructor);
integrationRegistry.register(blueBubblesIntegration, BlueBubblesInstance as unknown as InstanceConstructor);
integrationRegistry.register(nostrIntegration, NostrInstance as unknown as InstanceConstructor);

// ── AI Models ──
integrationRegistry.register(openaiIntegration, OpenAIInstance as unknown as InstanceConstructor);
integrationRegistry.register(anthropicIntegration, AnthropicInstance as unknown as InstanceConstructor);
integrationRegistry.register(googleIntegration, GoogleAIInstance as unknown as InstanceConstructor);
integrationRegistry.register(ollamaIntegration, OllamaInstance as unknown as InstanceConstructor);
integrationRegistry.register(openrouterIntegration, OpenRouterInstance as unknown as InstanceConstructor);
integrationRegistry.register(mistralIntegration, MistralInstance as unknown as InstanceConstructor);
integrationRegistry.register(deepseekIntegration, DeepSeekInstance as unknown as InstanceConstructor);
integrationRegistry.register(moonshotIntegration, MoonshotInstance as unknown as InstanceConstructor);
integrationRegistry.register(xaiIntegration, XAIInstance as unknown as InstanceConstructor);
integrationRegistry.register(perplexityIntegration, PerplexityInstance as unknown as InstanceConstructor);
integrationRegistry.register(minimaxIntegration, MiniMaxInstance as unknown as InstanceConstructor);
integrationRegistry.register(glmIntegration, GLMInstance as unknown as InstanceConstructor);
integrationRegistry.register(huggingfaceIntegration, HuggingFaceInstance as unknown as InstanceConstructor);
integrationRegistry.register(lmstudioIntegration, LMStudioInstance as unknown as InstanceConstructor);
integrationRegistry.register(vercelGatewayIntegration, VercelGatewayInstance as unknown as InstanceConstructor);

// ── Productivity ──
integrationRegistry.register(notionIntegration, NotionInstance as unknown as InstanceConstructor);
integrationRegistry.register(obsidianIntegration, ObsidianInstance as unknown as InstanceConstructor);
integrationRegistry.register(githubIntegration, GitHubInstance as unknown as InstanceConstructor);
integrationRegistry.register(trelloIntegration, TrelloInstance as unknown as InstanceConstructor);
integrationRegistry.register(appleNotesIntegration, AppleNotesInstance as unknown as InstanceConstructor);
integrationRegistry.register(appleRemindersIntegration, AppleRemindersInstance as unknown as InstanceConstructor);
integrationRegistry.register(things3Integration, Things3Instance as unknown as InstanceConstructor);
integrationRegistry.register(bearNotesIntegration, BearNotesInstance as unknown as InstanceConstructor);

// ── Tools & Automation ──
integrationRegistry.register(browserIntegration, BrowserInstance as unknown as InstanceConstructor);
integrationRegistry.register(cronIntegration, CronInstance as unknown as InstanceConstructor);
integrationRegistry.register(webhooksIntegration, WebhooksInstance as unknown as InstanceConstructor);
integrationRegistry.register(gmailIntegration, GmailInstance as unknown as InstanceConstructor);
integrationRegistry.register(weatherIntegration, WeatherInstance as unknown as InstanceConstructor);
integrationRegistry.register(onepasswordIntegration, OnePasswordInstance as unknown as InstanceConstructor);
integrationRegistry.register(voiceIntegration, VoiceInstance as unknown as InstanceConstructor);
integrationRegistry.register(canvasIntegration, CanvasInstance as unknown as InstanceConstructor);

// ── Music & Audio ──
integrationRegistry.register(spotifyIntegration, SpotifyInstance as unknown as InstanceConstructor);
integrationRegistry.register(sonosIntegration, SonosInstance as unknown as InstanceConstructor);
integrationRegistry.register(shazamIntegration, ShazamInstance as unknown as InstanceConstructor);

// ── Smart Home ──
integrationRegistry.register(hueIntegration, HueInstance as unknown as InstanceConstructor);
integrationRegistry.register(homeAssistantIntegration, HomeAssistantInstance as unknown as InstanceConstructor);
integrationRegistry.register(eightSleepIntegration, EightSleepInstance as unknown as InstanceConstructor);

// ── Media & Creative ──
integrationRegistry.register(imageGenIntegration, ImageGenInstance as unknown as InstanceConstructor);
integrationRegistry.register(gifSearchIntegration, GifSearchInstance as unknown as InstanceConstructor);
integrationRegistry.register(peekabooIntegration, PeekabooInstance as unknown as InstanceConstructor);

// ── Social ──
integrationRegistry.register(twitterIntegration, TwitterInstance as unknown as InstanceConstructor);
integrationRegistry.register(emailIntegration, EmailInstance as unknown as InstanceConstructor);
