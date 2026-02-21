import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – use vi.hoisted()
// ---------------------------------------------------------------------------
const { mockTeamRun, mockSwarmRun } = vi.hoisted(() => ({
  mockTeamRun: vi.fn(),
  mockSwarmRun: vi.fn(),
}));

vi.mock("@/lib/agents/team", () => ({
  TeamOrchestrator: class {
    run = mockTeamRun;
  },
}));

vi.mock("@/lib/agents/swarm", () => ({
  SwarmOrchestrator: class {
    run = mockSwarmRun;
  },
}));

vi.mock("@/lib/agents/presets", () => ({
  presetTeams: [
    {
      id: "research",
      name: "Research Team",
      description: "A research team",
      agents: [{ id: "agent1" }],
      strategy: "sequential",
    },
    {
      id: "code-review",
      name: "Code Review Team",
      description: "A code review team",
      agents: [{ id: "agent2" }],
      strategy: "chain",
    },
  ],
  presetSwarms: [
    {
      id: "analysis",
      name: "Analysis Swarm",
      description: "An analysis swarm",
      agents: [{ id: "agent3" }],
      aggregation: "concatenate",
    },
    {
      id: "fact-check",
      name: "Fact Check Swarm",
      description: "A fact checking swarm",
      agents: [{ id: "agent4" }],
      aggregation: "vote",
    },
  ],
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { spawnTeam, spawnSwarm, agentSkills } from "../agent-skills";

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------
const ctx = { userId: "user-1", conversationId: "conv-1" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("agent-skills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("agentSkills array", () => {
    it("exports both skills", () => {
      expect(agentSkills).toHaveLength(2);
      expect(agentSkills).toEqual([spawnTeam, spawnSwarm]);
    });
  });

  // ── spawnTeam ───────────────────────────────────────────────────────

  describe("spawnTeam", () => {
    it("has correct metadata", () => {
      expect(spawnTeam.id).toBe("spawn_team");
      expect(spawnTeam.category).toBe("system");
      expect(spawnTeam.description).toContain("research");
    });

    it("returns error for unknown team ID", async () => {
      const result = await spawnTeam.execute(
        { team_id: "nonexistent", task: "do something" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown team "nonexistent"');
      expect(result.output).toContain("research");
    });

    it("runs team successfully with context", async () => {
      mockTeamRun.mockResolvedValue({
        teamId: "research",
        strategy: "sequential",
        durationMs: 5000,
        finalOutput: "Research complete.",
        agentResults: [
          { agentName: "Researcher", durationMs: 3000 },
          { agentName: "Summarizer", durationMs: 2000 },
        ],
      });

      const result = await spawnTeam.execute(
        { team_id: "research", task: "research topic", context: "extra info" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Research Team");
      expect(result.output).toContain("sequential");
      expect(result.output).toContain("5s");
      expect(result.output).toContain("Researcher");
      expect(result.output).toContain("3s");
      expect(result.output).toContain("Research complete.");
      expect(result.data).toEqual({
        teamId: "research",
        strategy: "sequential",
        durationMs: 5000,
        agentCount: 2,
      });
    });

    it("runs team without context", async () => {
      mockTeamRun.mockResolvedValue({
        teamId: "code-review",
        strategy: "chain",
        durationMs: 10000,
        finalOutput: "Review done.",
        agentResults: [
          { agentName: "Reviewer", durationMs: 10000 },
        ],
      });

      const result = await spawnTeam.execute(
        { team_id: "code-review", task: "review code" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(mockTeamRun).toHaveBeenCalledWith({
        teamId: "code-review",
        task: "review code",
        context: undefined,
        userId: "user-1",
        conversationId: "conv-1",
      });
    });

    it("handles team execution error (Error instance)", async () => {
      mockTeamRun.mockRejectedValue(new Error("Model error"));

      const result = await spawnTeam.execute(
        { team_id: "research", task: "do something" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("Team execution failed: Model error");
    });

    it("handles team execution error (non-Error)", async () => {
      mockTeamRun.mockRejectedValue("unexpected");

      const result = await spawnTeam.execute(
        { team_id: "research", task: "do something" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown error");
    });
  });

  // ── spawnSwarm ──────────────────────────────────────────────────────

  describe("spawnSwarm", () => {
    it("has correct metadata", () => {
      expect(spawnSwarm.id).toBe("spawn_swarm");
      expect(spawnSwarm.category).toBe("system");
      expect(spawnSwarm.description).toContain("analysis");
    });

    it("returns error for unknown swarm ID", async () => {
      const result = await spawnSwarm.execute(
        { swarm_id: "nonexistent", task: "analyze" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain('Unknown swarm "nonexistent"');
      expect(result.output).toContain("analysis");
    });

    it("runs swarm successfully with context", async () => {
      mockSwarmRun.mockResolvedValue({
        swarmId: "analysis",
        aggregation: "concatenate",
        durationMs: 8000,
        finalOutput: "Analysis complete.",
        agentResults: [
          { agentName: "Analyst1", durationMs: 4000, error: undefined },
          { agentName: "Analyst2", durationMs: 4000, error: undefined },
        ],
      });

      const result = await spawnSwarm.execute(
        { swarm_id: "analysis", task: "analyze data", context: "data context" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Analysis Swarm");
      expect(result.output).toContain("concatenate");
      expect(result.output).toContain("8s");
      expect(result.output).toContain("Analyst1");
      expect(result.output).toContain("Analysis complete.");
      expect(result.data).toEqual({
        swarmId: "analysis",
        aggregation: "concatenate",
        durationMs: 8000,
        agentCount: 2,
      });
    });

    it("runs swarm without context", async () => {
      mockSwarmRun.mockResolvedValue({
        swarmId: "fact-check",
        aggregation: "vote",
        durationMs: 6000,
        finalOutput: "Fact check done.",
        agentResults: [
          { agentName: "Checker", durationMs: 6000 },
        ],
      });

      const result = await spawnSwarm.execute(
        { swarm_id: "fact-check", task: "verify claims" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(mockSwarmRun).toHaveBeenCalledWith({
        swarmId: "fact-check",
        task: "verify claims",
        context: undefined,
        userId: "user-1",
        conversationId: "conv-1",
      });
    });

    it("shows error status for failed agents", async () => {
      mockSwarmRun.mockResolvedValue({
        swarmId: "analysis",
        aggregation: "concatenate",
        durationMs: 5000,
        finalOutput: "Partial results.",
        agentResults: [
          { agentName: "OK-Agent", durationMs: 3000, error: undefined },
          { agentName: "Fail-Agent", durationMs: 2000, error: "timeout" },
        ],
      });

      const result = await spawnSwarm.execute(
        { swarm_id: "analysis", task: "analyze" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("OK-Agent");
      expect(result.output).toContain("3s");
      expect(result.output).toContain("Fail-Agent");
      expect(result.output).toContain("error: timeout");
    });

    it("handles swarm execution error (Error instance)", async () => {
      mockSwarmRun.mockRejectedValue(new Error("Orchestration failed"));

      const result = await spawnSwarm.execute(
        { swarm_id: "analysis", task: "analyze" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain(
        "Swarm execution failed: Orchestration failed"
      );
    });

    it("handles swarm execution error (non-Error)", async () => {
      mockSwarmRun.mockRejectedValue(42);

      const result = await spawnSwarm.execute(
        { swarm_id: "analysis", task: "analyze" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown error");
    });
  });
});
