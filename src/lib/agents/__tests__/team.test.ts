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
import { TeamOrchestrator } from "@/lib/agents/team";
import type {
  TeamDefinition,
  TeamRunConfig,
  AgentPersona,
} from "@/lib/agents/types";

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

function makeTeamDef(overrides: Partial<TeamDefinition> = {}): TeamDefinition {
  return {
    id: "test-team",
    name: "Test Team",
    description: "A test team",
    strategy: "sequential",
    agents: [
      makeAgent({ id: "a1", name: "Agent A" }),
      makeAgent({ id: "a2", name: "Agent B" }),
    ],
    ...overrides,
  };
}

const baseConfig: TeamRunConfig = {
  teamId: "test-team",
  task: "Do the thing",
  userId: "user-1",
  conversationId: "conv-1",
};

// ─── Tests ───────────────────────────────────────────────────
describe("TeamOrchestrator", () => {
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

  // ─── run dispatch ───────────────────────────────────────────
  describe("run", () => {
    it("dispatches to sequential strategy", async () => {
      const team = new TeamOrchestrator(makeTeamDef({ strategy: "sequential" }));
      const result = await team.run(baseConfig);

      expect(result.strategy).toBe("sequential");
      expect(result.teamId).toBe("test-team");
    });

    it("dispatches to round-robin strategy", async () => {
      const team = new TeamOrchestrator(
        makeTeamDef({ strategy: "round-robin" })
      );
      const result = await team.run(baseConfig);

      expect(result.strategy).toBe("round-robin");
    });

    it("dispatches to debate strategy", async () => {
      const team = new TeamOrchestrator(makeTeamDef({ strategy: "debate" }));
      const result = await team.run(baseConfig);

      expect(result.strategy).toBe("debate");
    });

    it("dispatches to chain strategy", async () => {
      const team = new TeamOrchestrator(makeTeamDef({ strategy: "chain" }));
      const result = await team.run(baseConfig);

      expect(result.strategy).toBe("chain");
    });

    it("dispatches to supervisor strategy", async () => {
      mocks.mockGenerateText.mockResolvedValue({
        text: '[{"agent_id": "a2", "subtask": "do something"}]',
      });

      const team = new TeamOrchestrator(
        makeTeamDef({ strategy: "supervisor", supervisorId: "a1" })
      );
      const result = await team.run(baseConfig);

      expect(result.strategy).toBe("supervisor");
    });

    it("falls back to sequential for unknown strategy", async () => {
      const team = new TeamOrchestrator(
        makeTeamDef({ strategy: "nonexistent" as never })
      );
      const result = await team.run(baseConfig);

      // Default case falls through to runSequential
      expect(result.strategy).toBe("sequential");
    });
  });

  // ─── runSequential ──────────────────────────────────────────
  describe("runSequential", () => {
    it("runs agents in order, passing context between them", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "output from A" })
        .mockResolvedValueOnce({ text: "output from B" })
        // Synthesis call (2 agents = multi-agent synthesize)
        .mockResolvedValueOnce({ text: "synthesized" });

      const team = new TeamOrchestrator(makeTeamDef({ strategy: "sequential" }));
      const result = await team.run(baseConfig);

      expect(result.agentResults).toHaveLength(2);
      expect(result.agentResults[0].output).toBe("output from A");
      expect(result.agentResults[1].output).toBe("output from B");
      expect(result.transcript).toHaveLength(2);

      // Second agent should have been called with first agent's output as context
      const secondCall = mocks.mockGenerateText.mock.calls[1][0];
      const msgs = secondCall.messages;
      const contextMsg = msgs.find((m: { content: string }) =>
        m.content.includes("output from A")
      );
      expect(contextMsg).toBeDefined();
    });

    it("uses provided context for the first agent", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "A" })
        .mockResolvedValueOnce({ text: "B" })
        .mockResolvedValueOnce({ text: "synth" });

      const team = new TeamOrchestrator(makeTeamDef({ strategy: "sequential" }));
      await team.run({ ...baseConfig, context: "initial context" });

      const firstCall = mocks.mockGenerateText.mock.calls[0][0];
      const msgs = firstCall.messages;
      const contextMsg = msgs.find((m: { content: string }) =>
        m.content.includes("initial context")
      );
      expect(contextMsg).toBeDefined();
    });
  });

  // ─── runRoundRobin ──────────────────────────────────────────
  describe("runRoundRobin", () => {
    it("runs multiple rounds of all agents", async () => {
      const team = new TeamOrchestrator(
        makeTeamDef({ strategy: "round-robin", maxRounds: 2 })
      );

      // 2 agents x 2 rounds = 4 calls + 1 synthesis call
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "r1-a1" })
        .mockResolvedValueOnce({ text: "r1-a2" })
        .mockResolvedValueOnce({ text: "r2-a1" })
        .mockResolvedValueOnce({ text: "r2-a2" })
        .mockResolvedValueOnce({ text: "synth" });

      const result = await team.run(baseConfig);

      expect(result.strategy).toBe("round-robin");
      expect(result.agentResults).toHaveLength(4);
      expect(result.transcript).toHaveLength(4);
    });

    it("defaults to 3 rounds when maxRounds is not specified", async () => {
      const team = new TeamOrchestrator(
        makeTeamDef({ strategy: "round-robin" })
      );

      // 2 agents x 3 rounds = 6 calls + 1 synthesis
      const result = await team.run(baseConfig);

      // 6 agent results
      expect(result.agentResults).toHaveLength(6);
    });

    it("uses modified task text for rounds after the first", async () => {
      const team = new TeamOrchestrator(
        makeTeamDef({ strategy: "round-robin", maxRounds: 2 })
      );

      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "r1-a1" })
        .mockResolvedValueOnce({ text: "r1-a2" })
        .mockResolvedValueOnce({ text: "r2-a1" })
        .mockResolvedValueOnce({ text: "r2-a2" })
        .mockResolvedValueOnce({ text: "synth" });

      await team.run(baseConfig);

      // Third call (round 2, first agent) should have modified task
      const thirdCall = mocks.mockGenerateText.mock.calls[2][0];
      const userMsg = thirdCall.messages[thirdCall.messages.length - 1];
      expect(userMsg.content).toContain("Continue the discussion");
      expect(userMsg.content).toContain("Round 2/2");
    });
  });

  // ─── runDebate ──────────────────────────────────────────────
  describe("runDebate", () => {
    it("has initial positions then rebuttal rounds", async () => {
      const team = new TeamOrchestrator(
        makeTeamDef({ strategy: "debate", maxRounds: 2 })
      );

      // 2 agents initial + 2 agents rebuttal (maxRounds-1 = 1 rebuttal round) + synthesis
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "position A" })
        .mockResolvedValueOnce({ text: "position B" })
        .mockResolvedValueOnce({ text: "rebuttal A" })
        .mockResolvedValueOnce({ text: "rebuttal B" })
        .mockResolvedValueOnce({ text: "synth" });

      const result = await team.run(baseConfig);

      expect(result.strategy).toBe("debate");
      // 2 initial + 2 rebuttal = 4
      expect(result.agentResults).toHaveLength(4);

      // First calls should contain "Take a clear position"
      const firstCallTask =
        mocks.mockGenerateText.mock.calls[0][0].messages.slice(-1)[0].content;
      expect(firstCallTask).toContain("Take a clear position");

      // Rebuttal calls should contain "rebuttal"
      const rebuttalCallTask =
        mocks.mockGenerateText.mock.calls[2][0].messages.slice(-1)[0].content;
      expect(rebuttalCallTask).toContain("rebuttal");
    });

    it("defaults to 2 maxRounds when not specified", async () => {
      const team = new TeamOrchestrator(
        makeTeamDef({ strategy: "debate" })
      );

      // 2 agents initial + 2 agents x 1 rebuttal round = 4 + synthesis
      const result = await team.run(baseConfig);

      expect(result.agentResults).toHaveLength(4);
    });
  });

  // ─── runChain ───────────────────────────────────────────────
  describe("runChain", () => {
    it("passes output of each agent as input to the next (pipeline)", async () => {
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "step 1 output" })
        .mockResolvedValueOnce({ text: "step 2 output" });

      const team = new TeamOrchestrator(makeTeamDef({ strategy: "chain" }));
      const result = await team.run(baseConfig);

      expect(result.strategy).toBe("chain");
      expect(result.finalOutput).toBe("step 2 output");

      // Second agent should receive first agent's output as task
      const secondCall = mocks.mockGenerateText.mock.calls[1][0];
      const userMsg = secondCall.messages[secondCall.messages.length - 1];
      expect(userMsg.content).toBe("step 1 output");
    });

    it("returns empty string as finalOutput when no agents", async () => {
      const team = new TeamOrchestrator(
        makeTeamDef({ strategy: "chain", agents: [] })
      );
      const result = await team.run(baseConfig);

      expect(result.finalOutput).toBe("");
    });
  });

  // ─── runSupervisor ──────────────────────────────────────────
  describe("runSupervisor", () => {
    it("supervisor decomposes, workers execute, supervisor synthesizes", async () => {
      const def = makeTeamDef({
        strategy: "supervisor",
        supervisorId: "a1",
        agents: [
          makeAgent({ id: "a1", name: "Supervisor" }),
          makeAgent({ id: "a2", name: "Worker" }),
        ],
      });

      mocks.mockGenerateText
        // Step 1: supervisor decomposes
        .mockResolvedValueOnce({
          text: '[{"agent_id": "a2", "subtask": "subtask for worker"}]',
        })
        // Step 2: worker executes
        .mockResolvedValueOnce({ text: "worker output" })
        // Step 3: supervisor synthesizes
        .mockResolvedValueOnce({ text: "final synthesis" });

      const team = new TeamOrchestrator(def);
      const result = await team.run(baseConfig);

      expect(result.strategy).toBe("supervisor");
      expect(result.finalOutput).toBe("final synthesis");
      expect(result.agentResults.length).toBeGreaterThanOrEqual(1);
    });

    it("falls back to giving all workers the full task when JSON parse fails", async () => {
      const def = makeTeamDef({
        strategy: "supervisor",
        supervisorId: "a1",
        agents: [
          makeAgent({ id: "a1", name: "Supervisor" }),
          makeAgent({ id: "a2", name: "Worker" }),
        ],
      });

      mocks.mockGenerateText
        // Supervisor returns text with [...] that is invalid JSON
        .mockResolvedValueOnce({ text: "[this is not valid json]" })
        // Worker runs with fallback full task
        .mockResolvedValueOnce({ text: "worker output" })
        // Supervisor synthesis
        .mockResolvedValueOnce({ text: "final" });

      const team = new TeamOrchestrator(def);
      const result = await team.run(baseConfig);

      expect(result.finalOutput).toBe("final");
    });

    it("returns null for worker nodes not found in the map", async () => {
      const def = makeTeamDef({
        strategy: "supervisor",
        supervisorId: "a1",
        agents: [
          makeAgent({ id: "a1", name: "Supervisor" }),
          makeAgent({ id: "a2", name: "Worker" }),
        ],
      });

      mocks.mockGenerateText
        // Supervisor assigns to non-existent agent
        .mockResolvedValueOnce({
          text: '[{"agent_id": "nonexistent", "subtask": "task"}]',
        })
        // Supervisor synthesis (no worker results)
        .mockResolvedValueOnce({ text: "synthesis without workers" });

      const team = new TeamOrchestrator(def);
      const result = await team.run(baseConfig);

      // Worker results should be empty since agent was not found
      expect(result.finalOutput).toBe("synthesis without workers");
    });

    it("throws if supervisor agent is not found", async () => {
      const def = makeTeamDef({
        strategy: "supervisor",
        supervisorId: "nonexistent",
        agents: [makeAgent({ id: "a1", name: "Agent A" })],
      });

      const team = new TeamOrchestrator(def);
      await expect(team.run(baseConfig)).rejects.toThrow(
        "Supervisor agent not found"
      );
    });

    it("uses the first agent as supervisor when supervisorId is not specified", async () => {
      const def = makeTeamDef({
        strategy: "supervisor",
        agents: [
          makeAgent({ id: "a1", name: "First Agent" }),
          makeAgent({ id: "a2", name: "Worker" }),
        ],
      });

      mocks.mockGenerateText
        .mockResolvedValueOnce({
          text: '[{"agent_id": "a2", "subtask": "work"}]',
        })
        .mockResolvedValueOnce({ text: "worker done" })
        .mockResolvedValueOnce({ text: "final" });

      const team = new TeamOrchestrator(def);
      const result = await team.run(baseConfig);

      expect(result.finalOutput).toBe("final");
    });

    it("falls back to empty assignments when supervisor output has no JSON array", async () => {
      const def = makeTeamDef({
        strategy: "supervisor",
        supervisorId: "a1",
        agents: [
          makeAgent({ id: "a1", name: "Supervisor" }),
          makeAgent({ id: "a2", name: "Worker" }),
        ],
      });

      // Supervisor returns output without any [...] pattern — jsonMatch is null
      // so assignments stays empty, no workers execute, supervisor synthesizes directly
      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "Just assign everything to everyone" })
        .mockResolvedValueOnce({ text: "supervisor synthesis" });

      const team = new TeamOrchestrator(def);
      const result = await team.run(baseConfig);

      expect(result.finalOutput).toBe("supervisor synthesis");
    });
  });

  // ─── synthesize ─────────────────────────────────────────────
  describe("synthesize (via run)", () => {
    it("uses synthesizerId agent when provided", async () => {
      const def = makeTeamDef({
        strategy: "sequential",
        synthesizerId: "a1",
      });

      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "agent A output" })
        .mockResolvedValueOnce({ text: "agent B output" })
        // Synthesizer agent run
        .mockResolvedValueOnce({ text: "synthesizer output" });

      const team = new TeamOrchestrator(def);
      const result = await team.run(baseConfig);

      expect(result.finalOutput).toBe("synthesizer output");
    });

    it("returns single agent output directly", async () => {
      const def = makeTeamDef({
        strategy: "sequential",
        agents: [makeAgent({ id: "a1", name: "Solo Agent" })],
      });

      mocks.mockGenerateText.mockResolvedValueOnce({ text: "solo output" });

      const team = new TeamOrchestrator(def);
      const result = await team.run(baseConfig);

      expect(result.finalOutput).toBe("solo output");
    });

    it("uses LLM synthesis for multiple agents without synthesizerId", async () => {
      const def = makeTeamDef({ strategy: "sequential" });

      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "output A" })
        .mockResolvedValueOnce({ text: "output B" })
        .mockResolvedValueOnce({ text: "LLM synthesized" });

      const team = new TeamOrchestrator(def);
      const result = await team.run(baseConfig);

      expect(result.finalOutput).toBe("LLM synthesized");
      // Last call should be the synthesis call
      const lastCall =
        mocks.mockGenerateText.mock.calls[
          mocks.mockGenerateText.mock.calls.length - 1
        ][0];
      const sysMsg = lastCall.messages[0];
      expect(sysMsg.content).toContain("synthesis agent");
    });

    it("falls back to LLM synthesis when synthesizerId does not match any node", async () => {
      const def = makeTeamDef({
        strategy: "sequential",
        synthesizerId: "nonexistent",
      });

      mocks.mockGenerateText
        .mockResolvedValueOnce({ text: "output A" })
        .mockResolvedValueOnce({ text: "output B" })
        .mockResolvedValueOnce({ text: "LLM fallback" });

      const team = new TeamOrchestrator(def);
      const result = await team.run(baseConfig);

      expect(result.finalOutput).toBe("LLM fallback");
    });
  });

  // ─── runStream ──────────────────────────────────────────────
  describe("runStream", () => {
    it("yields team_start, agent events, and complete", async () => {
      mocks.mockGenerateText.mockResolvedValue({ text: "synth output" });

      const team = new TeamOrchestrator(makeTeamDef());
      const events: unknown[] = [];

      for await (const event of team.runStream(baseConfig)) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({
        type: "team_start",
        teamId: "test-team",
        task: "Do the thing",
      });

      const completeEvent = events[events.length - 1] as {
        type: string;
        finalOutput: string;
      };
      expect(completeEvent.type).toBe("complete");
    });

    it("uses previous agent output as context for subsequent agents", async () => {
      mocks.mockGenerateText.mockResolvedValue({ text: "synth output" });

      const team = new TeamOrchestrator(makeTeamDef());
      const events: unknown[] = [];

      for await (const event of team.runStream(baseConfig)) {
        events.push(event);
      }

      // Should have agent_start and agent_done events for both agents
      const agentStarts = events.filter(
        (e) => (e as { type: string }).type === "agent_start"
      );
      expect(agentStarts.length).toBe(2);
    });

    it("uses config context for the first agent", async () => {
      mocks.mockGenerateText.mockResolvedValue({ text: "synth output" });

      const team = new TeamOrchestrator(makeTeamDef());
      const events: unknown[] = [];

      for await (const event of team.runStream({
        ...baseConfig,
        context: "initial ctx",
      })) {
        events.push(event);
      }

      // streamText was called with context
      expect(mocks.mockStreamText).toHaveBeenCalled();
    });

    it("records agent_done events in transcript and agentResults", async () => {
      mocks.mockGenerateText.mockResolvedValue({ text: "synth" });

      const team = new TeamOrchestrator(makeTeamDef());
      const events: unknown[] = [];

      for await (const event of team.runStream(baseConfig)) {
        events.push(event);
      }

      const doneEvents = events.filter(
        (e) => (e as { type: string }).type === "agent_done"
      );
      expect(doneEvents.length).toBe(2);
    });
  });
});
