import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ──────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const mockGenerateText = vi.fn().mockResolvedValue({ text: "mock output" });

  const mockAsyncIterable = {
    async *[Symbol.asyncIterator]() {
      yield "chunk1";
      yield "chunk2";
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
    mockAsyncIterable,
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

vi.mock("@/lib/schema-builder", async () => {
  const actual = await vi.importActual("@/lib/schema-builder");
  return actual;
});

vi.mock("@/lib/logger", () => {
  const logObj = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() };
  logObj.child.mockReturnValue(logObj);
  return { getLogger: () => logObj };
});

// ─── Import under test ──────────────────────────────────────
import { AgentNode } from "@/lib/agents/agent-node";
import type { AgentPersona, AgentMessage } from "@/lib/agents/types";

// ─── Helpers ─────────────────────────────────────────────────
function makePersona(overrides: Partial<AgentPersona> = {}): AgentPersona {
  return {
    id: "test-agent",
    name: "Test Agent",
    role: "general purpose helper",
    systemPrompt: "You are a test agent.",
    ...overrides,
  };
}

const baseRunParams = {
  task: "Do something",
  userId: "user-1",
  conversationId: "conv-1",
};

// ─── Tests ───────────────────────────────────────────────────
describe("AgentNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGenerateText.mockResolvedValue({ text: "mock output" });
    mocks.mockResolveModelFromSettings.mockResolvedValue("mock-model");
    mocks.mockSkillRegistryGetAll.mockReturnValue([]);
    mocks.mockIntegrationRegistryGetActiveInstancesForUser.mockReturnValue([]);
  });

  // ─── Constructor ────────────────────────────────────────────
  describe("constructor", () => {
    it("stores the persona", () => {
      const persona = makePersona();
      const node = new AgentNode(persona);
      expect(node.persona).toBe(persona);
    });
  });

  // ─── run ─────────────────────────────────────────────────────
  describe("run", () => {
    it("calls resolveModelFromSettings and generateText and returns output + durationMs", async () => {
      const node = new AgentNode(makePersona());
      const result = await node.run(baseRunParams);

      expect(mocks.mockResolveModelFromSettings).toHaveBeenCalledOnce();
      expect(mocks.mockGenerateText).toHaveBeenCalledOnce();
      expect(result.output).toBe("mock output");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("passes maxTokens and temperature from persona", async () => {
      const node = new AgentNode(
        makePersona({ maxTokens: 512, temperature: 0.7 })
      );
      await node.run(baseRunParams);

      const callArgs = mocks.mockGenerateText.mock.calls[0][0];
      expect(callArgs.maxOutputTokens).toBe(512);
      expect(callArgs.temperature).toBe(0.7);
    });
  });

  // ─── buildMessages (tested via run) ─────────────────────────
  describe("buildMessages (via run)", () => {
    it("includes system prompt as the first message", async () => {
      const node = new AgentNode(makePersona({ systemPrompt: "Be helpful." }));
      await node.run(baseRunParams);

      const messages = mocks.mockGenerateText.mock.calls[0][0].messages;
      expect(messages[0]).toEqual({
        role: "system",
        content: "Be helpful.",
      });
    });

    it("adds context as a system message when provided", async () => {
      const node = new AgentNode(makePersona());
      await node.run({ ...baseRunParams, context: "extra context" });

      const messages = mocks.mockGenerateText.mock.calls[0][0].messages;
      expect(messages[1]).toEqual({
        role: "system",
        content: "Context from previous agents or user:\n\nextra context",
      });
    });

    it("adds history as a system message when provided", async () => {
      const history: AgentMessage[] = [
        {
          agentId: "a1",
          agentName: "Agent A",
          role: "agent",
          content: "Hello from A",
          timestamp: new Date(),
        },
      ];
      const node = new AgentNode(makePersona());
      await node.run({ ...baseRunParams, history });

      const messages = mocks.mockGenerateText.mock.calls[0][0].messages;
      const historyMsg = messages.find((m: { content: string }) =>
        m.content.startsWith("Conversation between agents")
      );
      expect(historyMsg).toBeDefined();
      expect(historyMsg!.content).toContain("[Agent A (agent)]: Hello from A");
    });

    it("does not add context/history messages when not provided", async () => {
      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      const messages = mocks.mockGenerateText.mock.calls[0][0].messages;
      expect(messages).toHaveLength(2); // system + user
    });

    it("adds the task as the last user message", async () => {
      const node = new AgentNode(makePersona());
      await node.run({ ...baseRunParams, task: "my task" });

      const messages = mocks.mockGenerateText.mock.calls[0][0].messages;
      expect(messages[messages.length - 1]).toEqual({
        role: "user",
        content: "my task",
      });
    });

    it("does not add history message when history is an empty array", async () => {
      const node = new AgentNode(makePersona());
      await node.run({ ...baseRunParams, history: [] });

      const messages = mocks.mockGenerateText.mock.calls[0][0].messages;
      expect(messages).toHaveLength(2); // system + user only
    });
  });

  // ─── buildTools (tested via run) ────────────────────────────
  describe("buildTools (via run)", () => {
    it("registers skills from the registry", async () => {
      mocks.mockSkillRegistryGetAll.mockReturnValue([
        {
          id: "skill-a",
          description: "A skill",
          parameters: [
            {
              name: "input",
              type: "string",
              description: "input param",
              required: true,
            },
          ],
          execute: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      const toolsArg = mocks.mockGenerateText.mock.calls[0][0].tools;
      expect(toolsArg).toHaveProperty("skill-a");
      expect(toolsArg).toHaveProperty("handoff");
    });

    it("filters skills by skillIds when specified", async () => {
      mocks.mockSkillRegistryGetAll.mockReturnValue([
        {
          id: "skill-a",
          description: "A",
          parameters: [],
          execute: vi.fn(),
        },
        {
          id: "skill-b",
          description: "B",
          parameters: [],
          execute: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona({ skillIds: ["skill-a"] }));
      await node.run(baseRunParams);

      const toolsArg = mocks.mockGenerateText.mock.calls[0][0].tools;
      expect(toolsArg).toHaveProperty("skill-a");
      expect(toolsArg).not.toHaveProperty("skill-b");
    });

    it("registers integration skills", async () => {
      mocks.mockIntegrationRegistryGetActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "int-1",
            name: "Integration 1",
            skills: [
              {
                id: "int-skill-1",
                description: "An integration skill",
                parameters: [
                  {
                    name: "query",
                    type: "string",
                    description: "query param",
                    required: true,
                  },
                ],
              },
            ],
          },
          executeSkill: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      const toolsArg = mocks.mockGenerateText.mock.calls[0][0].tools;
      expect(toolsArg).toHaveProperty("int-skill-1");
    });

    it("filters integration skills by integrationIds when specified", async () => {
      mocks.mockIntegrationRegistryGetActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "int-1",
            name: "Integration 1",
            skills: [
              {
                id: "int-skill-1",
                description: "An integration skill",
                parameters: [],
              },
            ],
          },
          executeSkill: vi.fn(),
        },
        {
          definition: {
            id: "int-2",
            name: "Integration 2",
            skills: [
              {
                id: "int-skill-2",
                description: "Another integration skill",
                parameters: [],
              },
            ],
          },
          executeSkill: vi.fn(),
        },
      ]);

      const node = new AgentNode(
        makePersona({ integrationIds: ["int-1"] })
      );
      await node.run(baseRunParams);

      const toolsArg = mocks.mockGenerateText.mock.calls[0][0].tools;
      expect(toolsArg).toHaveProperty("int-skill-1");
      expect(toolsArg).not.toHaveProperty("int-skill-2");
    });

    it("always registers the handoff tool", async () => {
      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      const toolsArg = mocks.mockGenerateText.mock.calls[0][0].tools;
      expect(toolsArg).toHaveProperty("handoff");
    });

    it("handles number parameter type", async () => {
      mocks.mockSkillRegistryGetAll.mockReturnValue([
        {
          id: "calc",
          description: "Calculator",
          parameters: [
            {
              name: "value",
              type: "number",
              description: "A number",
              required: true,
            },
          ],
          execute: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      // tool() was called with a description containing "Calculator"
      const calcToolCall = mocks.mockTool.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as { description: string }).description === "Calculator"
      );
      expect(calcToolCall).toBeDefined();
    });

    it("handles boolean parameter type", async () => {
      mocks.mockSkillRegistryGetAll.mockReturnValue([
        {
          id: "toggle",
          description: "Toggle",
          parameters: [
            {
              name: "flag",
              type: "boolean",
              description: "A boolean",
              required: false,
            },
          ],
          execute: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      const toggleToolCall = mocks.mockTool.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as { description: string }).description === "Toggle"
      );
      expect(toggleToolCall).toBeDefined();
    });

    it("handles default (string) parameter type", async () => {
      mocks.mockSkillRegistryGetAll.mockReturnValue([
        {
          id: "text-skill",
          description: "Text",
          parameters: [
            {
              name: "text",
              type: "custom-type",
              description: "custom",
              required: true,
            },
          ],
          execute: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      const textToolCall = mocks.mockTool.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as { description: string }).description === "Text"
      );
      expect(textToolCall).toBeDefined();
    });

    it("handles optional parameters (not required)", async () => {
      mocks.mockSkillRegistryGetAll.mockReturnValue([
        {
          id: "optional-skill",
          description: "Optional",
          parameters: [
            {
              name: "opt",
              type: "string",
              description: "optional param",
              required: false,
            },
          ],
          execute: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      const optToolCall = mocks.mockTool.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as { description: string }).description === "Optional"
      );
      expect(optToolCall).toBeDefined();
    });

    it("handles number parameter type for integration skills", async () => {
      mocks.mockIntegrationRegistryGetActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "int-num",
            name: "NumIntegration",
            skills: [
              {
                id: "int-num-skill",
                description: "Number integration",
                parameters: [
                  {
                    name: "count",
                    type: "number",
                    description: "A number",
                    required: true,
                  },
                ],
              },
            ],
          },
          executeSkill: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      const toolsArg = mocks.mockGenerateText.mock.calls[0][0].tools;
      expect(toolsArg).toHaveProperty("int-num-skill");
    });

    it("handles boolean parameter type for integration skills", async () => {
      mocks.mockIntegrationRegistryGetActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "int-bool",
            name: "BoolIntegration",
            skills: [
              {
                id: "int-bool-skill",
                description: "Boolean integration",
                parameters: [
                  {
                    name: "active",
                    type: "boolean",
                    description: "A flag",
                    required: false,
                  },
                ],
              },
            ],
          },
          executeSkill: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      const toolsArg = mocks.mockGenerateText.mock.calls[0][0].tools;
      expect(toolsArg).toHaveProperty("int-bool-skill");
    });

    it("handles default (string) parameter type for integration skills", async () => {
      mocks.mockIntegrationRegistryGetActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "int-def",
            name: "DefIntegration",
            skills: [
              {
                id: "int-def-skill",
                description: "Default integration",
                parameters: [
                  {
                    name: "stuff",
                    type: "unknown-type",
                    description: "Stuff",
                    required: true,
                  },
                ],
              },
            ],
          },
          executeSkill: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      const toolsArg = mocks.mockGenerateText.mock.calls[0][0].tools;
      expect(toolsArg).toHaveProperty("int-def-skill");
    });

    it("includes all skills when skillIds is empty array", async () => {
      mocks.mockSkillRegistryGetAll.mockReturnValue([
        {
          id: "s1",
          description: "S1",
          parameters: [],
          execute: vi.fn(),
        },
        {
          id: "s2",
          description: "S2",
          parameters: [],
          execute: vi.fn(),
        },
      ]);

      // skillIds = [] means no filtering (empty array length is 0)
      const node = new AgentNode(makePersona({ skillIds: [] }));
      await node.run(baseRunParams);

      const toolsArg = mocks.mockGenerateText.mock.calls[0][0].tools;
      expect(toolsArg).toHaveProperty("s1");
      expect(toolsArg).toHaveProperty("s2");
    });

    it("includes all integrations when integrationIds is empty array", async () => {
      mocks.mockIntegrationRegistryGetActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "i1",
            name: "I1",
            skills: [
              { id: "is1", description: "IS1", parameters: [] },
            ],
          },
          executeSkill: vi.fn(),
        },
      ]);

      const node = new AgentNode(makePersona({ integrationIds: [] }));
      await node.run(baseRunParams);

      const toolsArg = mocks.mockGenerateText.mock.calls[0][0].tools;
      expect(toolsArg).toHaveProperty("is1");
    });

    it("skill execute callback invokes skill.execute", async () => {
      const mockExecute = vi.fn().mockResolvedValue({ success: true, output: "done" });
      mocks.mockSkillRegistryGetAll.mockReturnValue([
        {
          id: "exec-skill",
          description: "Exec skill",
          parameters: [],
          execute: mockExecute,
        },
      ]);

      // Capture the execute callback from tool()
      let capturedExecute: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mocks.mockTool.mockImplementation((opts: { description: string; execute?: (args: Record<string, unknown>) => Promise<unknown> }) => {
        if (opts.description === "Exec skill") {
          capturedExecute = opts.execute;
        }
        return opts;
      });

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      expect(capturedExecute).toBeDefined();
      const result = await capturedExecute!({ input: "test" });
      expect(result).toEqual({ success: true, output: "done" });
      expect(mockExecute).toHaveBeenCalledWith({ input: "test" }, expect.objectContaining({ userId: "user-1" }));
    });

    it("integration skill execute callback invokes instance.executeSkill", async () => {
      const mockExecSkill = vi.fn().mockResolvedValue({ success: true, output: "int-ok" });
      mocks.mockIntegrationRegistryGetActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "int-exec",
            name: "IntExec",
            skills: [
              { id: "int-exec-skill", description: "Int exec skill", parameters: [] },
            ],
          },
          executeSkill: mockExecSkill,
        },
      ]);

      let capturedExecute: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mocks.mockTool.mockImplementation((opts: { description: string; execute?: (args: Record<string, unknown>) => Promise<unknown> }) => {
        if (opts.description === "[IntExec] Int exec skill") {
          capturedExecute = opts.execute;
        }
        return opts;
      });

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      expect(capturedExecute).toBeDefined();
      const result = await capturedExecute!({ query: "test" });
      expect(result).toEqual({ success: true, output: "int-ok" });
      expect(mockExecSkill).toHaveBeenCalledWith("int-exec-skill", { query: "test" });
    });

    it("handoff tool execute callback returns handoff data", async () => {
      let capturedExecute: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mocks.mockTool.mockImplementation((opts: { description: string; execute?: (args: Record<string, unknown>) => Promise<unknown> }) => {
        if (opts.description?.includes("Hand off the current task")) {
          capturedExecute = opts.execute;
        }
        return opts;
      });

      const node = new AgentNode(makePersona());
      await node.run(baseRunParams);

      expect(capturedExecute).toBeDefined();
      const result = await capturedExecute!({
        target_agent: "agent-2",
        reason: "out of expertise",
        context: "I did step 1",
      }) as { success: boolean; output: string; data: Record<string, unknown> };
      expect(result.success).toBe(true);
      expect(result.output).toContain("Handoff to agent-2");
      expect(result.output).toContain("out of expertise");
      expect(result.data).toEqual({
        target_agent: "agent-2",
        reason: "out of expertise",
        context: "I did step 1",
      });
    });
  });

  // ─── runStream ──────────────────────────────────────────────
  describe("runStream", () => {
    it("yields agent_start, agent_chunk events, and agent_done event", async () => {
      const node = new AgentNode(makePersona({ id: "s-agent", name: "Stream Agent" }));
      const events: unknown[] = [];

      for await (const event of node.runStream(baseRunParams)) {
        events.push(event);
      }

      expect(events[0]).toEqual({
        type: "agent_start",
        agentId: "s-agent",
        agentName: "Stream Agent",
      });

      // Two chunks from the mock async iterable
      expect(events[1]).toMatchObject({
        type: "agent_chunk",
        agentId: "s-agent",
        chunk: "chunk1",
      });
      expect(events[2]).toMatchObject({
        type: "agent_chunk",
        agentId: "s-agent",
        chunk: "chunk2",
      });

      // Final done event
      const doneEvent = events[events.length - 1] as {
        type: string;
        agentId: string;
        output: string;
        durationMs: number;
      };
      expect(doneEvent.type).toBe("agent_done");
      expect(doneEvent.agentId).toBe("s-agent");
      expect(doneEvent.output).toBe("chunk1chunk2");
      expect(doneEvent.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("yields agent_error event when an error occurs", async () => {
      mocks.mockStreamText.mockReturnValueOnce({
        textStream: {
          async *[Symbol.asyncIterator]() {
            throw new Error("stream failed");
          },
        },
      });

      const node = new AgentNode(makePersona({ id: "err-agent" }));
      const events: unknown[] = [];

      for await (const event of node.runStream(baseRunParams)) {
        events.push(event);
      }

      expect(events[0]).toMatchObject({ type: "agent_start" });
      expect(events[1]).toEqual({
        type: "agent_error",
        agentId: "err-agent",
        error: "stream failed",
      });
    });

    it("yields agent_error with 'Unknown error' for non-Error throws", async () => {
      mocks.mockStreamText.mockReturnValueOnce({
        textStream: {
          async *[Symbol.asyncIterator]() {
            throw "string error";
          },
        },
      });

      const node = new AgentNode(makePersona({ id: "err2" }));
      const events: unknown[] = [];

      for await (const event of node.runStream(baseRunParams)) {
        events.push(event);
      }

      expect(events[1]).toEqual({
        type: "agent_error",
        agentId: "err2",
        error: "Unknown error",
      });
    });
  });

  // ─── canHandle ──────────────────────────────────────────────
  describe("canHandle", () => {
    it("returns a score based on keyword overlap", async () => {
      const node = new AgentNode(
        makePersona({ role: "software development expert" })
      );
      const result = await node.canHandle("software development question");

      expect(result.score).toBeGreaterThan(0);
      expect(result.reason).toContain("Role keyword overlap");
    });

    it("returns zero score for no overlap", async () => {
      const node = new AgentNode(makePersona({ role: "finance expert" }));
      const result = await node.canHandle("cooking recipe");

      expect(result.score).toBe(0);
      expect(result.reason).toContain("0/");
    });

    it("returns score capped at 1", async () => {
      // all words overlap
      const node = new AgentNode(makePersona({ role: "hello world" }));
      const result = await node.canHandle("hello world extra words");

      expect(result.score).toBeLessThanOrEqual(1);
    });
  });
});
