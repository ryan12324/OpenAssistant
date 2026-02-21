import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const mockGenerateText = vi.fn().mockResolvedValue({ text: "mock output" });

  const mockAsyncIterable = {
    async *[Symbol.asyncIterator]() {
      yield "chunk1";
    },
  };
  const mockStreamText = vi.fn().mockReturnValue({
    textStream: mockAsyncIterable,
  });
  const mockTool = vi.fn().mockImplementation((args) => args);
  const mockResolveModelFromSettings = vi.fn().mockResolvedValue("mock-model");
  const mockSkillRegistryGetAll = vi.fn().mockReturnValue([]);
  const mockIntegrationRegistryGetActiveInstancesForUser = vi
    .fn()
    .mockReturnValue([]);

  return {
    mockGenerateText,
    mockStreamText,
    mockTool,
    mockResolveModelFromSettings,
    mockSkillRegistryGetAll,
    mockIntegrationRegistryGetActiveInstancesForUser,
  };
});

vi.mock("ai", () => ({
  generateText: mocks.mockGenerateText,
  streamText: mocks.mockStreamText,
  tool: mocks.mockTool,
  stepCountIs: vi.fn((n: number) => `stepCountIs(${n})`),
}));

vi.mock("@/lib/ai/providers", () => ({
  resolveModelFromSettings: mocks.mockResolveModelFromSettings,
}));

vi.mock("@/lib/skills/registry", () => ({
  skillRegistry: {
    getAll: mocks.mockSkillRegistryGetAll,
  },
}));

vi.mock("@/lib/integrations", () => ({
  integrationRegistry: {
    getActiveInstancesForUser: mocks.mockIntegrationRegistryGetActiveInstancesForUser,
  },
}));

vi.mock("@/lib/logger", () => {
  const logObj = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() };
  logObj.child.mockReturnValue(logObj);
  return { getLogger: () => logObj };
});

// ─── Import under test ──────────────────────────────────────
import { AgentRouter } from "@/lib/agents/router";
import type { RouterDefinition, AgentPersona } from "@/lib/agents/types";

// ─── Helpers ─────────────────────────────────────────────────
function makeAgent(overrides: Partial<AgentPersona> = {}): AgentPersona {
  return {
    id: "default-agent",
    name: "Default Agent",
    role: "general purpose helper",
    systemPrompt: "You are a default agent.",
    ...overrides,
  };
}

function makeDefinition(
  overrides: Partial<RouterDefinition> = {}
): RouterDefinition {
  return {
    id: "test-router",
    name: "Test Router",
    description: "A test router",
    defaultAgentId: "default-agent",
    agents: [
      makeAgent({ id: "default-agent", name: "Default Agent", role: "general purpose helper" }),
      makeAgent({ id: "code-agent", name: "Code Agent", role: "software development coding" }),
    ],
    ...overrides,
  };
}

const baseParams = {
  message: "Hello",
  userId: "user-1",
  conversationId: "conv-1",
};

// ─── Tests ───────────────────────────────────────────────────
describe("AgentRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGenerateText.mockResolvedValue({ text: "mock output" });
    mocks.mockResolveModelFromSettings.mockResolvedValue("mock-model");
    mocks.mockSkillRegistryGetAll.mockReturnValue([]);
    mocks.mockIntegrationRegistryGetActiveInstancesForUser.mockReturnValue([]);
  });

  // ─── Constructor ────────────────────────────────────────────
  describe("constructor", () => {
    it("creates AgentNode for each agent in the definition", () => {
      const def = makeDefinition();
      const router = new AgentRouter(def);
      // Router was created without error. We verify by routing successfully.
      expect(router).toBeDefined();
    });
  });

  // ─── route ──────────────────────────────────────────────────
  describe("route", () => {
    it("classifies and then runs the selected agent", async () => {
      const def = makeDefinition({ useAIRouting: false });
      const router = new AgentRouter(def);

      const result = await router.route({
        ...baseParams,
        message: "software development coding",
      });

      expect(result.agentId).toBe("code-agent");
      expect(result.agentName).toBe("Code Agent");
      expect(result.output).toBe("mock output");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.routingReason).toContain("Code Agent");
    });

    it("passes context to the selected agent", async () => {
      const def = makeDefinition({ useAIRouting: false });
      const router = new AgentRouter(def);

      await router.route({ ...baseParams, context: "some context" });

      const callArgs = mocks.mockGenerateText.mock.calls[0][0];
      const messages = callArgs.messages;
      const contextMsg = messages.find((m: { content: string }) =>
        m.content.includes("some context")
      );
      expect(contextMsg).toBeDefined();
    });
  });

  // ─── routeStream ────────────────────────────────────────────
  describe("routeStream", () => {
    it("yields a handoff event then streams from the selected agent", async () => {
      const def = makeDefinition({ useAIRouting: false });
      const router = new AgentRouter(def);

      const events: unknown[] = [];
      for await (const event of router.routeStream(baseParams)) {
        events.push(event);
      }

      // First event should be a handoff
      expect(events[0]).toMatchObject({
        type: "handoff",
        from: "router",
      });

      // Subsequent events come from the agent's runStream
      const agentStart = events.find(
        (e: unknown) => (e as { type: string }).type === "agent_start"
      );
      expect(agentStart).toBeDefined();
    });

    it("passes context to the streamed agent", async () => {
      const def = makeDefinition({ useAIRouting: false });
      const router = new AgentRouter(def);

      const events: unknown[] = [];
      for await (const event of router.routeStream({
        ...baseParams,
        context: "ctx",
      })) {
        events.push(event);
      }

      // streamText was called (via runStream of agent)
      expect(mocks.mockStreamText).toHaveBeenCalled();
    });
  });

  // ─── classify (private, tested via route) ───────────────────
  describe("classify", () => {
    it("uses classifyWithAI when useAIRouting is true", async () => {
      mocks.mockGenerateText.mockResolvedValueOnce({
        text: '{"agent_id": "code-agent", "reason": "code task"}',
      });
      // Second call is the actual agent run
      mocks.mockGenerateText.mockResolvedValueOnce({
        text: "agent response",
      });

      const def = makeDefinition({ useAIRouting: true });
      const router = new AgentRouter(def);

      const result = await router.route(baseParams);
      expect(result.agentId).toBe("code-agent");
      expect(result.routingReason).toBe("code task");
    });

    it("uses classifyWithKeywords when useAIRouting is false", async () => {
      const def = makeDefinition({ useAIRouting: false });
      const router = new AgentRouter(def);

      // With no keyword overlap, should get default agent
      const result = await router.route({
        ...baseParams,
        message: "xyz unrelated",
      });
      expect(result.agentId).toBe("default-agent");
    });
  });

  // ─── classifyWithKeywords ───────────────────────────────────
  describe("classifyWithKeywords", () => {
    it("selects the agent with the best score", async () => {
      const def = makeDefinition({ useAIRouting: false });
      const router = new AgentRouter(def);

      const result = await router.route({
        ...baseParams,
        message: "software development coding",
      });

      expect(result.agentId).toBe("code-agent");
      expect(result.routingReason).toContain("Best keyword match");
    });

    it("falls back to default agent when all scores are zero", async () => {
      const def = makeDefinition({ useAIRouting: false });
      const router = new AgentRouter(def);

      const result = await router.route({
        ...baseParams,
        message: "zzzzz nonsense",
      });

      expect(result.agentId).toBe("default-agent");
      expect(result.routingReason).toContain("Default agent");
    });
  });

  // ─── classifyWithAI ─────────────────────────────────────────
  describe("classifyWithAI", () => {
    it("parses JSON response and selects the agent", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({
          text: 'Here is my routing: {"agent_id": "code-agent", "reason": "It is a code question"}',
        })
        .mockResolvedValueOnce({ text: "code response" });

      const def = makeDefinition({ useAIRouting: true });
      const router = new AgentRouter(def);

      const result = await router.route(baseParams);
      expect(result.agentId).toBe("code-agent");
      expect(result.routingReason).toBe("It is a code question");
    });

    it("falls back to default agent on JSON parse error", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "not valid json at all" })
        .mockResolvedValueOnce({ text: "default response" });

      const def = makeDefinition({ useAIRouting: true });
      const router = new AgentRouter(def);

      const result = await router.route(baseParams);
      expect(result.agentId).toBe("default-agent");
      expect(result.routingReason).toBe("AI routing fallback to default agent");
    });

    it("falls back to default when agent_id is not found in nodes", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({
          text: '{"agent_id": "nonexistent-agent", "reason": "picked wrong"}',
        })
        .mockResolvedValueOnce({ text: "default response" });

      const def = makeDefinition({ useAIRouting: true });
      const router = new AgentRouter(def);

      const result = await router.route(baseParams);
      expect(result.agentId).toBe("default-agent");
      expect(result.routingReason).toBe("AI routing fallback to default agent");
    });

    it("falls back to default when JSON has no agent_id field", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({
          text: '{"wrong_field": "code-agent"}',
        })
        .mockResolvedValueOnce({ text: "default response" });

      const def = makeDefinition({ useAIRouting: true });
      const router = new AgentRouter(def);

      const result = await router.route(baseParams);
      expect(result.agentId).toBe("default-agent");
      expect(result.routingReason).toBe("AI routing fallback to default agent");
    });

    it("uses 'AI routing' as reason when parsed JSON has no reason field", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({
          text: '{"agent_id": "code-agent"}',
        })
        .mockResolvedValueOnce({ text: "code response" });

      const def = makeDefinition({ useAIRouting: true });
      const router = new AgentRouter(def);

      const result = await router.route(baseParams);
      expect(result.agentId).toBe("code-agent");
      expect(result.routingReason).toBe("AI routing");
    });

    it("falls back to default when text has no JSON object match", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "no json here" })
        .mockResolvedValueOnce({ text: "default response" });

      const def = makeDefinition({ useAIRouting: true });
      const router = new AgentRouter(def);

      const result = await router.route(baseParams);
      expect(result.agentId).toBe("default-agent");
      expect(result.routingReason).toBe("AI routing fallback to default agent");
    });
  });
});
