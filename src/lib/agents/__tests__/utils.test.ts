import { describe, it, expect, vi } from "vitest";

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

vi.mock("@/lib/logger", () => {
  const logObj = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() };
  logObj.child.mockReturnValue(logObj);
  return { getLogger: () => logObj };
});

// ─── Import under test ──────────────────────────────────────
import {
  initializeNodes,
  recordAgentExecution,
} from "@/lib/agents/utils";
import type { TranscriptEntry, AgentResult } from "@/lib/agents/utils";
import type { AgentPersona } from "@/lib/agents/types";

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

// ─── Tests ───────────────────────────────────────────────────
describe("initializeNodes", () => {
  it("creates a Map of AgentNode instances keyed by agent id", () => {
    const agents = [
      makeAgent({ id: "a1", name: "Agent A" }),
      makeAgent({ id: "a2", name: "Agent B" }),
    ];

    const nodes = initializeNodes(agents);

    expect(nodes).toBeInstanceOf(Map);
    expect(nodes.size).toBe(2);
    expect(nodes.has("a1")).toBe(true);
    expect(nodes.has("a2")).toBe(true);
    expect(nodes.get("a1")!.persona.name).toBe("Agent A");
    expect(nodes.get("a2")!.persona.name).toBe("Agent B");
  });

  it("returns an empty Map when given an empty array", () => {
    const nodes = initializeNodes([]);

    expect(nodes).toBeInstanceOf(Map);
    expect(nodes.size).toBe(0);
  });

  it("handles a single agent", () => {
    const agents = [makeAgent({ id: "solo", name: "Solo Agent" })];

    const nodes = initializeNodes(agents);

    expect(nodes.size).toBe(1);
    expect(nodes.get("solo")!.persona.id).toBe("solo");
  });

  it("preserves all persona properties on the created nodes", () => {
    const agents = [
      makeAgent({
        id: "full",
        name: "Full Agent",
        role: "specialist",
        systemPrompt: "Custom prompt",
        temperature: 0.5,
        maxTokens: 1000,
        skillIds: ["web_search"],
      }),
    ];

    const nodes = initializeNodes(agents);
    const persona = nodes.get("full")!.persona;

    expect(persona.role).toBe("specialist");
    expect(persona.systemPrompt).toBe("Custom prompt");
    expect(persona.temperature).toBe(0.5);
    expect(persona.maxTokens).toBe(1000);
    expect(persona.skillIds).toEqual(["web_search"]);
  });

  it("overwrites duplicate agent ids with the last one", () => {
    const agents = [
      makeAgent({ id: "dup", name: "First" }),
      makeAgent({ id: "dup", name: "Second" }),
    ];

    const nodes = initializeNodes(agents);

    expect(nodes.size).toBe(1);
    expect(nodes.get("dup")!.persona.name).toBe("Second");
  });
});

describe("recordAgentExecution", () => {
  it("pushes a transcript entry and an agent result", () => {
    const transcript: TranscriptEntry[] = [];
    const agentResults: AgentResult[] = [];

    recordAgentExecution(
      transcript,
      agentResults,
      { id: "a1", name: "Agent A" },
      { output: "hello world", durationMs: 123 },
    );

    expect(transcript).toHaveLength(1);
    expect(agentResults).toHaveLength(1);

    expect(transcript[0]).toMatchObject({
      agentId: "a1",
      agentName: "Agent A",
      role: "agent",
      content: "hello world",
    });
    expect(transcript[0].timestamp).toBeInstanceOf(Date);

    expect(agentResults[0]).toEqual({
      agentId: "a1",
      agentName: "Agent A",
      output: "hello world",
      durationMs: 123,
    });
  });

  it("appends to existing arrays without replacing previous entries", () => {
    const transcript: TranscriptEntry[] = [
      {
        agentId: "existing",
        agentName: "Existing",
        role: "agent",
        content: "prior entry",
        timestamp: new Date(),
      },
    ];
    const agentResults: AgentResult[] = [
      {
        agentId: "existing",
        agentName: "Existing",
        output: "prior output",
        durationMs: 50,
      },
    ];

    recordAgentExecution(
      transcript,
      agentResults,
      { id: "a2", name: "Agent B" },
      { output: "new output", durationMs: 200 },
    );

    expect(transcript).toHaveLength(2);
    expect(agentResults).toHaveLength(2);
    expect(transcript[0].agentId).toBe("existing");
    expect(transcript[1].agentId).toBe("a2");
    expect(agentResults[0].agentId).toBe("existing");
    expect(agentResults[1].agentId).toBe("a2");
  });

  it("records multiple executions sequentially", () => {
    const transcript: TranscriptEntry[] = [];
    const agentResults: AgentResult[] = [];

    recordAgentExecution(
      transcript,
      agentResults,
      { id: "a1", name: "Agent A" },
      { output: "first", durationMs: 100 },
    );
    recordAgentExecution(
      transcript,
      agentResults,
      { id: "a2", name: "Agent B" },
      { output: "second", durationMs: 200 },
    );
    recordAgentExecution(
      transcript,
      agentResults,
      { id: "a3", name: "Agent C" },
      { output: "third", durationMs: 300 },
    );

    expect(transcript).toHaveLength(3);
    expect(agentResults).toHaveLength(3);
    expect(agentResults[0].output).toBe("first");
    expect(agentResults[1].output).toBe("second");
    expect(agentResults[2].output).toBe("third");
  });

  it("handles empty string output", () => {
    const transcript: TranscriptEntry[] = [];
    const agentResults: AgentResult[] = [];

    recordAgentExecution(
      transcript,
      agentResults,
      { id: "a1", name: "Agent A" },
      { output: "", durationMs: 0 },
    );

    expect(transcript[0].content).toBe("");
    expect(agentResults[0].output).toBe("");
    expect(agentResults[0].durationMs).toBe(0);
  });
});
