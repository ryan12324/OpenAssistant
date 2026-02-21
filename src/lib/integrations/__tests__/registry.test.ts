const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockPrisma = vi.hoisted(() => ({
  skillConfig: {
    findMany: vi.fn(),
  },
}));

// Base mock class that stores definition & config, like the real BaseIntegration
const MockIntegration = vi.hoisted(() => {
  return class MockIntegration {
    definition: unknown;
    config: unknown;
    status = "disconnected";
    constructor(definition: unknown, config: unknown) {
      this.definition = definition;
      this.config = config;
    }
    async connect() { this.status = "connected"; }
    async disconnect() { this.status = "disconnected"; }
    async executeSkill() { return { success: true, output: "mock" }; }
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

// Mock all integration imports to avoid pulling in real modules
vi.mock("@/lib/integrations/chat/telegram", () => ({
  telegramIntegration: { id: "telegram", name: "Telegram", category: "chat", skills: [], configFields: [] },
  TelegramInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/chat/discord", () => ({
  discordIntegration: { id: "discord", name: "Discord", category: "chat", skills: [], configFields: [] },
  DiscordInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/chat/slack", () => ({
  slackIntegration: { id: "slack", name: "Slack", category: "chat", skills: [], configFields: [] },
  SlackInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/chat/whatsapp", () => ({
  whatsappIntegration: { id: "whatsapp", name: "WhatsApp", category: "chat", skills: [], configFields: [] },
  WhatsAppInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/chat/signal", () => ({
  signalIntegration: { id: "signal", name: "Signal", category: "chat", skills: [], configFields: [] },
  SignalInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/chat/matrix", () => ({
  matrixIntegration: { id: "matrix", name: "Matrix", category: "chat", skills: [], configFields: [] },
  MatrixInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/chat/teams", () => ({
  teamsIntegration: { id: "teams", name: "Teams", category: "chat", skills: [], configFields: [] },
  TeamsInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/chat/webchat", () => ({
  webchatIntegration: { id: "webchat", name: "WebChat", category: "chat", skills: [], configFields: [] },
  WebChatInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/chat/imessage", () => ({
  imessageIntegration: { id: "imessage", name: "iMessage", category: "chat", skills: [], configFields: [] },
  iMessageInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/chat/bluebubbles", () => ({
  blueBubblesIntegration: { id: "bluebubbles", name: "BlueBubbles", category: "chat", skills: [], configFields: [] },
  BlueBubblesInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/chat/nostr", () => ({
  nostrIntegration: { id: "nostr", name: "Nostr", category: "chat", skills: [], configFields: [] },
  NostrInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/openai", () => ({
  openaiIntegration: { id: "openai", name: "OpenAI", category: "ai", skills: [], configFields: [] },
  OpenAIInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/anthropic", () => ({
  anthropicIntegration: { id: "anthropic", name: "Anthropic", category: "ai", skills: [], configFields: [] },
  AnthropicInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/google", () => ({
  googleIntegration: { id: "google-ai", name: "Google AI", category: "ai", skills: [], configFields: [] },
  GoogleAIInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/ollama", () => ({
  ollamaIntegration: { id: "ollama", name: "Ollama", category: "ai", skills: [], configFields: [] },
  OllamaInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/openrouter", () => ({
  openrouterIntegration: { id: "openrouter", name: "OpenRouter", category: "ai", skills: [], configFields: [] },
  OpenRouterInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/mistral", () => ({
  mistralIntegration: { id: "mistral", name: "Mistral", category: "ai", skills: [], configFields: [] },
  MistralInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/deepseek", () => ({
  deepseekIntegration: { id: "deepseek", name: "DeepSeek", category: "ai", skills: [], configFields: [] },
  DeepSeekInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/moonshot", () => ({
  moonshotIntegration: { id: "moonshot", name: "Moonshot", category: "ai", skills: [], configFields: [] },
  MoonshotInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/xai", () => ({
  xaiIntegration: { id: "xai", name: "xAI", category: "ai", skills: [], configFields: [] },
  XAIInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/perplexity", () => ({
  perplexityIntegration: { id: "perplexity", name: "Perplexity", category: "ai", skills: [], configFields: [] },
  PerplexityInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/minimax", () => ({
  minimaxIntegration: { id: "minimax", name: "MiniMax", category: "ai", skills: [], configFields: [] },
  MiniMaxInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/glm", () => ({
  glmIntegration: { id: "glm", name: "GLM", category: "ai", skills: [], configFields: [] },
  GLMInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/huggingface", () => ({
  huggingfaceIntegration: { id: "huggingface", name: "HuggingFace", category: "ai", skills: [], configFields: [] },
  HuggingFaceInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/lmstudio", () => ({
  lmstudioIntegration: { id: "lmstudio", name: "LM Studio", category: "ai", skills: [], configFields: [] },
  LMStudioInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/ai/vercel-gateway", () => ({
  vercelGatewayIntegration: { id: "vercel-gateway", name: "Vercel Gateway", category: "ai", skills: [], configFields: [] },
  VercelGatewayInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/productivity/notion", () => ({
  notionIntegration: { id: "notion", name: "Notion", category: "productivity", skills: [], configFields: [] },
  NotionInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/productivity/obsidian", () => ({
  obsidianIntegration: { id: "obsidian", name: "Obsidian", category: "productivity", skills: [], configFields: [] },
  ObsidianInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/productivity/github", () => ({
  githubIntegration: { id: "github", name: "GitHub", category: "productivity", skills: [], configFields: [] },
  GitHubInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/productivity/trello", () => ({
  trelloIntegration: { id: "trello", name: "Trello", category: "productivity", skills: [], configFields: [] },
  TrelloInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/productivity/apple-notes", () => ({
  appleNotesIntegration: { id: "apple-notes", name: "Apple Notes", category: "productivity", skills: [], configFields: [] },
  AppleNotesInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/productivity/apple-reminders", () => ({
  appleRemindersIntegration: { id: "apple-reminders", name: "Apple Reminders", category: "productivity", skills: [], configFields: [] },
  AppleRemindersInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/productivity/things3", () => ({
  things3Integration: { id: "things3", name: "Things 3", category: "productivity", skills: [], configFields: [] },
  Things3Instance: MockIntegration,
}));
vi.mock("@/lib/integrations/productivity/bear-notes", () => ({
  bearNotesIntegration: { id: "bear-notes", name: "Bear Notes", category: "productivity", skills: [], configFields: [] },
  BearNotesInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/tools/browser", () => ({
  browserIntegration: { id: "browser", name: "Browser", category: "tools", skills: [], configFields: [] },
  BrowserInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/tools/cron", () => ({
  cronIntegration: { id: "cron", name: "Cron", category: "tools", skills: [], configFields: [] },
  CronInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/tools/webhooks", () => ({
  webhooksIntegration: { id: "webhooks", name: "Webhooks", category: "tools", skills: [], configFields: [] },
  WebhooksInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/tools/gmail", () => ({
  gmailIntegration: { id: "gmail", name: "Gmail", category: "tools", skills: [], configFields: [] },
  GmailInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/tools/weather", () => ({
  weatherIntegration: { id: "weather", name: "Weather", category: "tools", skills: [], configFields: [] },
  WeatherInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/tools/onepassword", () => ({
  onepasswordIntegration: { id: "1password", name: "1Password", category: "tools", skills: [], configFields: [] },
  OnePasswordInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/tools/voice", () => ({
  voiceIntegration: { id: "voice", name: "Voice", category: "tools", skills: [], configFields: [] },
  VoiceInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/tools/canvas", () => ({
  canvasIntegration: { id: "canvas", name: "Canvas", category: "tools", skills: [], configFields: [] },
  CanvasInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/music/spotify", () => ({
  spotifyIntegration: { id: "spotify", name: "Spotify", category: "music", skills: [], configFields: [] },
  SpotifyInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/music/sonos", () => ({
  sonosIntegration: { id: "sonos", name: "Sonos", category: "music", skills: [], configFields: [] },
  SonosInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/music/shazam", () => ({
  shazamIntegration: { id: "shazam", name: "Shazam", category: "music", skills: [], configFields: [] },
  ShazamInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/smart-home/hue", () => ({
  hueIntegration: { id: "philips-hue", name: "Philips Hue", category: "smart-home", skills: [], configFields: [] },
  HueInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/smart-home/home-assistant", () => ({
  homeAssistantIntegration: { id: "home-assistant", name: "Home Assistant", category: "smart-home", skills: [], configFields: [] },
  HomeAssistantInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/smart-home/eightsleep", () => ({
  eightSleepIntegration: { id: "8sleep", name: "8Sleep", category: "smart-home", skills: [], configFields: [] },
  EightSleepInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/media/image-gen", () => ({
  imageGenIntegration: { id: "image-gen", name: "Image Gen", category: "media", skills: [], configFields: [] },
  ImageGenInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/media/gif-search", () => ({
  gifSearchIntegration: { id: "gif-search", name: "GIF Search", category: "media", skills: [], configFields: [] },
  GifSearchInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/media/peekaboo", () => ({
  peekabooIntegration: { id: "peekaboo", name: "Peekaboo", category: "media", skills: [], configFields: [] },
  PeekabooInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/social/twitter", () => ({
  twitterIntegration: { id: "twitter", name: "Twitter", category: "social", skills: [], configFields: [] },
  TwitterInstance: MockIntegration,
}));
vi.mock("@/lib/integrations/social/email", () => ({
  emailIntegration: { id: "email", name: "Email", category: "social", skills: [], configFields: [] },
  EmailInstance: MockIntegration,
}));

import { integrationRegistry } from "@/lib/integrations/registry";
import type { HydrationResult } from "@/lib/integrations/registry";
import type { IntegrationDefinition, IntegrationConfig, IntegrationInstance } from "@/lib/integrations/types";

describe("IntegrationRegistry (via exported singleton)", () => {
  describe("getAllDefinitions", () => {
    it("should return all registered definitions", () => {
      const defs = integrationRegistry.getAllDefinitions();
      expect(defs.length).toBeGreaterThan(0);
      expect(defs.some((d) => d.id === "telegram")).toBe(true);
      expect(defs.some((d) => d.id === "discord")).toBe(true);
    });
  });

  describe("getDefinition", () => {
    it("should return a definition by ID", () => {
      const def = integrationRegistry.getDefinition("telegram");
      expect(def).toBeDefined();
      expect(def?.id).toBe("telegram");
    });

    it("should return undefined for unknown ID", () => {
      expect(integrationRegistry.getDefinition("nonexistent")).toBeUndefined();
    });
  });

  describe("getByCategory", () => {
    it("should filter by category", () => {
      const chatDefs = integrationRegistry.getByCategory("chat");
      expect(chatDefs.length).toBeGreaterThan(0);
      chatDefs.forEach((d) => expect(d.category).toBe("chat"));
    });

    it("should return empty for unknown category", () => {
      expect(integrationRegistry.getByCategory("nonexistent")).toEqual([]);
    });
  });

  describe("createInstance", () => {
    it("should create an instance for a known integration", async () => {
      const instance = await integrationRegistry.createInstance("telegram", { botToken: "test" });
      expect(instance).toBeDefined();
    });

    it("should throw for unknown integration", async () => {
      await expect(integrationRegistry.createInstance("unknown", {})).rejects.toThrow(
        'Integration "unknown" not found'
      );
    });
  });

  describe("createUserInstance", () => {
    it("should create a user-scoped instance", async () => {
      const instance = await integrationRegistry.createUserInstance("user1", "telegram", { botToken: "x" });
      expect(instance).toBeDefined();
    });

    it("should throw for unknown integration", async () => {
      await expect(
        integrationRegistry.createUserInstance("user1", "unknown", {})
      ).rejects.toThrow('Integration "unknown" not found');
    });
  });

  describe("getInstance", () => {
    it("should return a created instance", async () => {
      await integrationRegistry.createInstance("discord", { botToken: "x" });
      const inst = integrationRegistry.getInstance("discord");
      expect(inst).toBeDefined();
    });

    it("should return undefined for uncreated instance", () => {
      expect(integrationRegistry.getInstance("never-created")).toBeUndefined();
    });
  });

  describe("getActiveInstances", () => {
    it("should only return connected instances", async () => {
      const inst = await integrationRegistry.createInstance("slack", { botToken: "x" });
      // instance is not connected yet
      const activeBefore = integrationRegistry.getActiveInstances();
      const slackActive = activeBefore.find((i) => i.definition.id === "slack");
      // The mock class won't have status "connected" unless we set it
      expect(slackActive).toBeUndefined();

      // Simulate connect
      inst.status = "connected";
      const activeAfter = integrationRegistry.getActiveInstances();
      const found = activeAfter.find((i) => i.definition.id === "slack");
      expect(found).toBeDefined();
    });
  });

  describe("getActiveInstancesForUser", () => {
    it("should include user-scoped connected instances", async () => {
      const inst = await integrationRegistry.createUserInstance("userA", "matrix", { accessToken: "t" });
      inst.status = "connected";
      const active = integrationRegistry.getActiveInstancesForUser("userA");
      expect(active.some((i) => i.definition.id === "matrix")).toBe(true);
    });

    it("should include global connected instances when no user instance exists", async () => {
      const gInst = await integrationRegistry.createInstance("webchat", { enabled: true });
      gInst.status = "connected";
      // userB has no webchat user-scoped instance
      const active = integrationRegistry.getActiveInstancesForUser("userB");
      expect(active.some((i) => i.definition.id === "webchat")).toBe(true);
    });

    it("should prefer user instances over global when both exist", async () => {
      const globalInst = await integrationRegistry.createInstance("signal", { phoneNumber: "+1" });
      globalInst.status = "connected";
      const userInst = await integrationRegistry.createUserInstance("userC", "signal", { phoneNumber: "+2" });
      userInst.status = "connected";

      const active = integrationRegistry.getActiveInstancesForUser("userC");
      const signalInstances = active.filter((i) => i.definition.id === "signal");
      // Only one signal instance (user-scoped takes priority)
      expect(signalInstances.length).toBe(1);
    });
  });

  describe("hydrateUserIntegrations", () => {
    it("should skip if user already hydrated and return empty result", async () => {
      // First hydration
      mockPrisma.skillConfig.findMany.mockResolvedValueOnce([]);
      await integrationRegistry.hydrateUserIntegrations("hydrateUser1");

      // Second call should be cached
      const result = await integrationRegistry.hydrateUserIntegrations("hydrateUser1");
      // findMany should only be called once
      expect(mockPrisma.skillConfig.findMany).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ loaded: [], failed: [] });
    });

    it("should hydrate configs from DB and return loaded integrations", async () => {
      mockPrisma.skillConfig.findMany.mockResolvedValueOnce([
        { skillId: "telegram", enabled: true, config: JSON.stringify({ botToken: "test-token" }) },
      ]);

      const result = await integrationRegistry.hydrateUserIntegrations("hydrateUser2");
      // Should have created a user instance
      expect(mockLog.info).toHaveBeenCalledWith(
        "Creating user integration instance",
        expect.objectContaining({ userId: "hydrateUser2", integrationId: "telegram" })
      );
      expect(result.loaded).toContain("telegram");
      expect(result.failed).toEqual([]);
    });

    it("should skip configs with no config field", async () => {
      mockPrisma.skillConfig.findMany.mockResolvedValueOnce([
        { skillId: "telegram", enabled: true, config: null },
      ]);

      await integrationRegistry.hydrateUserIntegrations("hydrateUser3");
      // Should not attempt to create instance for null config
      expect(mockLog.info).not.toHaveBeenCalledWith(
        "Creating user integration instance",
        expect.objectContaining({ userId: "hydrateUser3" })
      );
    });

    it("should skip configs for unregistered integrations", async () => {
      mockPrisma.skillConfig.findMany.mockResolvedValueOnce([
        { skillId: "nonexistent-integration", enabled: true, config: '{"key":"val"}' },
      ]);

      await integrationRegistry.hydrateUserIntegrations("hydrateUser4");
      expect(mockLog.info).not.toHaveBeenCalledWith(
        "Creating user integration instance",
        expect.objectContaining({ userId: "hydrateUser4" })
      );
    });

    it("should handle DB errors gracefully and return empty result", async () => {
      mockPrisma.skillConfig.findMany.mockRejectedValueOnce(new Error("DB down"));

      const result = await integrationRegistry.hydrateUserIntegrations("hydrateUser5");
      expect(mockLog.error).toHaveBeenCalledWith(
        "Failed to hydrate integrations",
        expect.objectContaining({ userId: "hydrateUser5" })
      );
      expect(result).toEqual({ loaded: [], failed: [] });
    });

    it("should handle individual integration hydration errors and report in failed", async () => {
      mockPrisma.skillConfig.findMany.mockResolvedValueOnce([
        { skillId: "telegram", enabled: true, config: "invalid json" },
      ]);

      const result = await integrationRegistry.hydrateUserIntegrations("hydrateUser6");
      expect(mockLog.warn).toHaveBeenCalled();
      expect(result.loaded).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe("telegram");
      expect(result.failed[0].error).toBeDefined();
    });

    it("should skip already active user instances", async () => {
      // Pre-create a connected instance
      const inst = await integrationRegistry.createUserInstance("hydrateUser7", "telegram", { botToken: "x" });
      inst.status = "connected";

      mockPrisma.skillConfig.findMany.mockResolvedValueOnce([
        { skillId: "telegram", enabled: true, config: JSON.stringify({ botToken: "y" }) },
      ]);

      const result = await integrationRegistry.hydrateUserIntegrations("hydrateUser7");
      // Should log completion with 0 hydrated since it was already active
      expect(result.loaded).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it("should return mixed loaded and failed results", async () => {
      mockPrisma.skillConfig.findMany.mockResolvedValueOnce([
        { skillId: "discord", enabled: true, config: JSON.stringify({ botToken: "good-token" }) },
        { skillId: "slack", enabled: true, config: "not valid json" },
      ]);

      const result = await integrationRegistry.hydrateUserIntegrations("hydrateUser8");
      expect(result.loaded).toContain("discord");
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe("slack");
    });
  });

  describe("invalidateUser", () => {
    it("should clear hydration cache and remove user instances", async () => {
      const inst = await integrationRegistry.createUserInstance("invalidateUser", "telegram", { botToken: "t" });
      inst.status = "connected";
      inst.disconnect = vi.fn().mockResolvedValue(undefined);

      // Hydrate first
      mockPrisma.skillConfig.findMany.mockResolvedValueOnce([]);
      await integrationRegistry.hydrateUserIntegrations("invalidateUser");

      integrationRegistry.invalidateUser("invalidateUser");
      expect(inst.disconnect).toHaveBeenCalled();
    });
  });

  describe("disconnectAll", () => {
    it("should disconnect all global and user instances", async () => {
      const g = await integrationRegistry.createInstance("browser", { headless: true });
      g.disconnect = vi.fn().mockResolvedValue(undefined);
      const u = await integrationRegistry.createUserInstance("dUser", "cron", { enabled: true });
      u.disconnect = vi.fn().mockResolvedValue(undefined);

      await integrationRegistry.disconnectAll();
      expect(g.disconnect).toHaveBeenCalled();
      expect(u.disconnect).toHaveBeenCalled();
    });

    it("should handle disconnect errors gracefully", async () => {
      const inst = await integrationRegistry.createInstance("weather", { apiKey: "k" });
      inst.disconnect = vi.fn().mockRejectedValue(new Error("disconnect fail"));

      await integrationRegistry.disconnectAll();
      expect(mockLog.error).toHaveBeenCalled();
    });

    it("should handle user instance disconnect errors gracefully", async () => {
      const userInst = await integrationRegistry.createUserInstance("errUser", "voice", { provider: "browser" });
      userInst.disconnect = vi.fn().mockRejectedValue(new Error("user disconnect fail"));

      await integrationRegistry.disconnectAll();
      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to disconnect"),
        expect.objectContaining({ error: "user disconnect fail" })
      );
    });
  });
});
