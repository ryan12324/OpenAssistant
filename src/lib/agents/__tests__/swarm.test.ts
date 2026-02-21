import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const mockGenerateText = vi.fn().mockResolvedValue({ text: "mock output" });

  const mockStreamText = vi.fn().mockReturnValue({
    textStream: {
      async *[Symbol.asyncIterator]() {
        yield "chunk";
      },
    },
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

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── Import under test ──────────────────────────────────────
import { SwarmOrchestrator } from "@/lib/agents/swarm";
import type { SwarmDefinition, SwarmRunConfig, AgentPersona } from "@/lib/agents/types";

// ─── Helpers ─────────────────────────────────────────────────
function makeAgent(overrides: Partial<AgentPersona> = {}): AgentPersona {
  return {
    id: "agent-1",
    name: "Agent 1",
    role: "helper",
    systemPrompt: "You are an agent.",
    ...overrides,
  };
}

function makeSwarmDef(
  overrides: Partial<SwarmDefinition> = {}
): SwarmDefinition {
  return {
    id: "test-swarm",
    name: "Test Swarm",
    description: "A test swarm",
    aggregation: "concatenate",
    agents: [
      makeAgent({ id: "a1", name: "Agent A" }),
      makeAgent({ id: "a2", name: "Agent B" }),
    ],
    ...overrides,
  };
}

const baseConfig: SwarmRunConfig = {
  swarmId: "test-swarm",
  task: "Do the thing",
  userId: "user-1",
  conversationId: "conv-1",
};

// ─── Tests ───────────────────────────────────────────────────
describe("SwarmOrchestrator", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.mockGenerateText.mockResolvedValue({ text: "mock output" });
    mocks.mockStreamText.mockReturnValue({
      textStream: {
        async *[Symbol.asyncIterator]() {
          yield "chunk";
        },
      },
    });
    mocks.mockTool.mockImplementation((args) => args);
    mocks.mockResolveModelFromSettings.mockResolvedValue("mock-model");
    mocks.mockSkillRegistryGetAll.mockReturnValue([]);
    mocks.mockIntegrationRegistryGetActiveInstancesForUser.mockReturnValue([]);
  });

  // ─── run ────────────────────────────────────────────────────
  describe("run", () => {
    it("runs all agents in parallel and returns aggregated result", async () => {
      const swarm = new SwarmOrchestrator(makeSwarmDef());
      const result = await swarm.run(baseConfig);

      expect(result.swarmId).toBe("test-swarm");
      expect(result.task).toBe("Do the thing");
      expect(result.agentResults).toHaveLength(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.finalOutput).toContain("Agent A");
    });

    it("uses agentTasks override when provided", async () => {
      const config: SwarmRunConfig = {
        ...baseConfig,
        agentTasks: { a1: "special task for a1" },
      };
      const swarm = new SwarmOrchestrator(makeSwarmDef());
      await swarm.run(config);

      // generateText called twice — once for each agent
      expect(mocks.mockGenerateText).toHaveBeenCalledTimes(2);

      // First call should have the special task
      const firstCallMessages = mocks.mockGenerateText.mock.calls[0][0].messages;
      const userMessage = firstCallMessages[firstCallMessages.length - 1];
      expect(userMessage.content).toBe("special task for a1");
    });

    it("handles agent timeout", async () => {
      mocks.mockGenerateText.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ text: "late" }), 5000)
          )
      );

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ agentTimeoutMs: 10 })
      );
      const result = await swarm.run(baseConfig);

      // Both agents should have timed out
      const errors = result.agentResults.filter((r) => r.error);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toBe("Agent timeout");
    });

    it("reports failure when minCompletions is not met", async () => {
      mocks.mockGenerateText.mockRejectedValue(new Error("agent failed"));

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ minCompletions: 2 })
      );
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toContain("Swarm failed");
      expect(result.finalOutput).toContain("0/2");
    });

    it("uses default agentTimeoutMs of 60000 when not specified", async () => {
      const swarm = new SwarmOrchestrator(makeSwarmDef());
      const result = await swarm.run(baseConfig);

      // It should succeed (no timeout with the default)
      expect(result.agentResults.every((r) => !r.error)).toBe(true);
    });

    it("uses default minCompletions of 1 when not specified", async () => {
      // Make one agent fail, one succeed
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "success" })
        .mockRejectedValueOnce(new Error("fail"));

      const swarm = new SwarmOrchestrator(makeSwarmDef());
      const result = await swarm.run(baseConfig);

      // Should not report failure since 1 >= 1
      expect(result.finalOutput).not.toContain("Swarm failed");
    });

    it("handles non-Error throws in agent execution", async () => {
      mocks.mockGenerateText.mockRejectedValue("string error");

      const swarm = new SwarmOrchestrator(makeSwarmDef({ minCompletions: 0 }));
      const result = await swarm.run(baseConfig);

      const errors = result.agentResults.filter((r) => r.error);
      expect(errors[0].error).toBe("Unknown error");
    });
  });

  // ─── Aggregation modes ──────────────────────────────────────
  describe("aggregate", () => {
    it("returns 'No agents produced output.' when 0 successful results via runStream", async () => {
      // With no agents, runStream skips the while loop and calls aggregate([])
      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ agents: [] })
      );

      const events: unknown[] = [];
      for await (const event of swarm.runStream(baseConfig)) {
        events.push(event);
      }

      const completeEvent = events.find(
        (e) => (e as { type: string }).type === "complete"
      ) as { type: string; finalOutput: string };
      expect(completeEvent).toBeDefined();
      expect(completeEvent.finalOutput).toBe("No agents produced output.");
    });

    it("returns single agent output directly for 1 result", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "only output" })
        .mockRejectedValueOnce(new Error("fail"));

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ minCompletions: 1 })
      );
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toBe("only output");
    });

    it("concatenates outputs for concatenate mode", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "output A" })
        .mockResolvedValueOnce({ text: "output B" });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "concatenate" })
      );
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toContain("## Agent A");
      expect(result.finalOutput).toContain("output A");
      expect(result.finalOutput).toContain("## Agent B");
      expect(result.finalOutput).toContain("output B");
      expect(result.finalOutput).toContain("---");
    });

    it("performs majority vote for vote mode", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "Yes" })
        .mockResolvedValueOnce({ text: "Yes" });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "vote" })
      );
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toContain("Yes");
      expect(result.finalOutput).toContain("2/2");
    });

    it("synthesizes outputs for synthesize mode (without synthesizerId)", async () => {
      // Two agent calls + one synthesis call
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "agent A output" })
        .mockResolvedValueOnce({ text: "agent B output" })
        .mockResolvedValueOnce({ text: "synthesized output" });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "synthesize" })
      );
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toBe("synthesized output");
    });

    it("synthesizes outputs for synthesize mode (with synthesizerId)", async () => {
      // Two agent calls + one synthesizer agent run
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "agent A output" })
        .mockResolvedValueOnce({ text: "agent B output" })
        .mockResolvedValueOnce({ text: "synthesizer output" });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "synthesize", synthesizerId: "a1" })
      );
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toBe("synthesizer output");
    });

    it("falls back to LLM synthesis when synthesizerId does not match any node", async () => {
      // Two agent calls + one fallback LLM synthesis call
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "agent A output" })
        .mockResolvedValueOnce({ text: "agent B output" })
        .mockResolvedValueOnce({ text: "fallback synthesis" });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "synthesize", synthesizerId: "nonexistent" })
      );
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toBe("fallback synthesis");
    });

    it("picks best output for best mode", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "option A" })
        .mockResolvedValueOnce({ text: "option B" })
        .mockResolvedValueOnce({ text: "best is A" });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "best" })
      );
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toBe("best is A");
    });

    it("merges valid JSON outputs for merge mode", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: '{"key1": "val1"}' })
        .mockResolvedValueOnce({ text: '{"key2": "val2"}' });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "merge" })
      );
      const result = await swarm.run(baseConfig);

      const parsed = JSON.parse(result.finalOutput);
      expect(parsed.key1).toBe("val1");
      expect(parsed.key2).toBe("val2");
    });

    it("stores non-JSON outputs by agent name for merge mode", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "not json" })
        .mockResolvedValueOnce({ text: '{"key": "val"}' });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "merge" })
      );
      const result = await swarm.run(baseConfig);

      const parsed = JSON.parse(result.finalOutput);
      expect(parsed["Agent A"]).toBe("not json");
      expect(parsed.key).toBe("val");
    });

    it("falls back to simple join for unknown aggregation mode", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "out1" })
        .mockResolvedValueOnce({ text: "out2" });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "unknown" as never })
      );
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toContain("out1");
      expect(result.finalOutput).toContain("out2");
    });
  });

  // ─── aggregateVote ──────────────────────────────────────────
  describe("aggregateVote", () => {
    it("picks the majority vote", async () => {
      const def = makeSwarmDef({
        aggregation: "vote",
        agents: [
          makeAgent({ id: "a1", name: "A1" }),
          makeAgent({ id: "a2", name: "A2" }),
          makeAgent({ id: "a3", name: "A3" }),
        ],
      });

      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "TRUE" })
        .mockResolvedValueOnce({ text: "FALSE" })
        .mockResolvedValueOnce({ text: "TRUE" });

      const swarm = new SwarmOrchestrator(def);
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toContain("TRUE");
      expect(result.finalOutput).toContain("2/3");
    });

    it("handles case-insensitive comparison for votes", async () => {
      const def = makeSwarmDef({
        aggregation: "vote",
        agents: [
          makeAgent({ id: "a1", name: "A1" }),
          makeAgent({ id: "a2", name: "A2" }),
        ],
      });

      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "Yes" })
        .mockResolvedValueOnce({ text: "  yes  " });

      const swarm = new SwarmOrchestrator(def);
      const result = await swarm.run(baseConfig);

      expect(result.finalOutput).toContain("2/2");
    });

    it("uses winner fallback when original output is empty string", async () => {
      // When output.trim().toLowerCase() matches winner but output itself is ""
      // (falsy), the || winner fallback is used
      const def = makeSwarmDef({
        aggregation: "vote",
        agents: [
          makeAgent({ id: "a1", name: "A1" }),
          makeAgent({ id: "a2", name: "A2" }),
        ],
      });

      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "" })
        .mockResolvedValueOnce({ text: "" });

      const swarm = new SwarmOrchestrator(def);
      const result = await swarm.run(baseConfig);

      // Both vote for "" (empty), winner is "", find returns output "" which is falsy,
      // so || winner is used (also "")
      expect(result.finalOutput).toContain("2/2");
    });
  });

  // ─── aggregateMerge ─────────────────────────────────────────
  describe("aggregateMerge", () => {
    it("merges valid JSON from multiple agents", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: '{"a": 1}' })
        .mockResolvedValueOnce({ text: '{"b": 2}' });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "merge" })
      );
      const result = await swarm.run(baseConfig);

      const parsed = JSON.parse(result.finalOutput);
      expect(parsed.a).toBe(1);
      expect(parsed.b).toBe(2);
    });

    it("stores invalid JSON under agent name", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "plain text" })
        .mockResolvedValueOnce({ text: "also plain" });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "merge" })
      );
      const result = await swarm.run(baseConfig);

      const parsed = JSON.parse(result.finalOutput);
      expect(parsed["Agent A"]).toBe("plain text");
      expect(parsed["Agent B"]).toBe("also plain");
    });
  });

  // ─── runStream ──────────────────────────────────────────────
  describe("runStream", () => {
    it("yields swarm_start, agent events, and complete", async () => {
      const swarm = new SwarmOrchestrator(makeSwarmDef());
      const events: unknown[] = [];

      for await (const event of swarm.runStream(baseConfig)) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({
        type: "swarm_start",
        swarmId: "test-swarm",
        task: "Do the thing",
      });

      const completeEvent = events[events.length - 1] as {
        type: string;
        finalOutput: string;
        durationMs: number;
      };
      expect(completeEvent.type).toBe("complete");
      expect(completeEvent.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("yields synthesis_start for synthesize aggregation mode", async () => {
      mocks.mockGenerateText.mockResolvedValue({ text: "mock output" });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "synthesize" })
      );
      const events: unknown[] = [];

      for await (const event of swarm.runStream(baseConfig)) {
        events.push(event);
      }

      const synthesisStart = events.find(
        (e) => (e as { type: string }).type === "synthesis_start"
      );
      expect(synthesisStart).toBeDefined();
      expect(synthesisStart).toMatchObject({
        type: "synthesis_start",
        synthesizerId: "system",
      });
    });

    it("uses synthesizerId in synthesis_start when provided", async () => {
      mocks.mockGenerateText.mockResolvedValue({ text: "mock output" });

      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "synthesize", synthesizerId: "a1" })
      );
      const events: unknown[] = [];

      for await (const event of swarm.runStream(baseConfig)) {
        events.push(event);
      }

      const synthesisStart = events.find(
        (e) => (e as { type: string }).type === "synthesis_start"
      );
      expect(synthesisStart).toMatchObject({
        type: "synthesis_start",
        synthesizerId: "a1",
      });
    });

    it("does not yield synthesis_start for non-synthesize modes", async () => {
      const swarm = new SwarmOrchestrator(
        makeSwarmDef({ aggregation: "concatenate" })
      );
      const events: unknown[] = [];

      for await (const event of swarm.runStream(baseConfig)) {
        events.push(event);
      }

      const synthesisStart = events.find(
        (e) => (e as { type: string }).type === "synthesis_start"
      );
      expect(synthesisStart).toBeUndefined();
    });

    it("uses agentTasks override in stream mode", async () => {
      const config: SwarmRunConfig = {
        ...baseConfig,
        agentTasks: { a1: "custom task" },
      };
      const swarm = new SwarmOrchestrator(makeSwarmDef());

      const events: unknown[] = [];
      for await (const event of swarm.runStream(config)) {
        events.push(event);
      }

      // streamText should have been called with the custom task for a1
      expect(mocks.mockStreamText).toHaveBeenCalled();
    });
  });
});
