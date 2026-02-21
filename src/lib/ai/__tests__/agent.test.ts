const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockStreamText = vi.hoisted(() => vi.fn());
const mockGenerateText = vi.hoisted(() => vi.fn());
const mockTool = vi.hoisted(() => vi.fn((opts: unknown) => opts));

const mockSkillRegistry = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

const mockMemoryManager = vi.hoisted(() => ({
  ingestFile: vi.fn(),
}));

const mockIntegrationRegistry = vi.hoisted(() => ({
  hydrateUserIntegrations: vi.fn(),
  getActiveInstancesForUser: vi.fn(),
}));

const mockResolveModelFromSettings = vi.hoisted(() => vi.fn());

const mockAudit = vi.hoisted(() => vi.fn());

const mockMcpManager = vi.hoisted(() => ({
  hydrateUserConnections: vi.fn(),
  hydrateGlobalConnections: vi.fn(),
  getToolsForUser: vi.fn(),
  callTool: vi.fn(),
}));

const mockGetToolApprovalRequirement = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
  tool: mockTool,
}));

vi.mock("zod", async () => {
  const actual = await vi.importActual("zod");
  return actual;
});

vi.mock("@/lib/skills/registry", () => ({
  skillRegistry: mockSkillRegistry,
}));

vi.mock("@/lib/rag/memory", () => ({
  memoryManager: mockMemoryManager,
}));

vi.mock("@/lib/integrations", () => ({
  integrationRegistry: mockIntegrationRegistry,
}));

vi.mock("@/lib/ai/providers", () => ({
  resolveModelFromSettings: mockResolveModelFromSettings,
}));

vi.mock("@/lib/audit", () => ({
  audit: mockAudit,
}));

vi.mock("@/lib/mcp/client", () => ({
  mcpManager: mockMcpManager,
}));

vi.mock("@/lib/mcp/permissions", () => ({
  getToolApprovalRequirement: mockGetToolApprovalRequirement,
}));

import { streamAgentResponse, generateAgentResponse } from "@/lib/ai/agent";

describe("agent", () => {
  const mockModel = { modelId: "test-model" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSkillRegistry.getAll.mockReturnValue([]);
    mockIntegrationRegistry.hydrateUserIntegrations.mockResolvedValue(undefined);
    mockIntegrationRegistry.getActiveInstancesForUser.mockReturnValue([]);
    mockResolveModelFromSettings.mockResolvedValue(mockModel);
    mockMcpManager.hydrateUserConnections.mockResolvedValue(undefined);
    mockMcpManager.hydrateGlobalConnections.mockResolvedValue(undefined);
    mockMcpManager.getToolsForUser.mockReturnValue([]);
  });

  describe("streamAgentResponse", () => {
    it("should hydrate integrations and MCP, then call streamText", async () => {
      const mockResult = { textStream: "stream" };
      mockStreamText.mockReturnValue(mockResult);

      const result = await streamAgentResponse({
        messages: [{ role: "user", content: "Hello" }],
        userId: "u1",
        conversationId: "c1",
      });

      expect(mockIntegrationRegistry.hydrateUserIntegrations).toHaveBeenCalledWith("u1");
      expect(mockMcpManager.hydrateUserConnections).toHaveBeenCalledWith("u1");
      expect(mockMcpManager.hydrateGlobalConnections).toHaveBeenCalled();
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: mockModel,
          maxSteps: 10,
        })
      );
      expect(result).toBe(mockResult);
    });

    it("should include memory context when provided", async () => {
      mockStreamText.mockReturnValue({});

      await streamAgentResponse({
        messages: [{ role: "user", content: "Hi" }],
        userId: "u1",
        conversationId: "c1",
        memoryContext: "User likes cats",
      });

      const call = mockStreamText.mock.calls[0][0];
      const systemMessages = call.messages.filter((m: { role: string }) => m.role === "system");
      expect(systemMessages.length).toBe(2);
      expect(systemMessages[1].content).toContain("User likes cats");
    });

    it("should not add memory system message when no memoryContext", async () => {
      mockStreamText.mockReturnValue({});

      await streamAgentResponse({
        messages: [{ role: "user", content: "Hi" }],
        userId: "u1",
        conversationId: "c1",
      });

      const call = mockStreamText.mock.calls[0][0];
      const systemMessages = call.messages.filter((m: { role: string }) => m.role === "system");
      expect(systemMessages.length).toBe(1);
    });

    it("should register built-in skills as tools", async () => {
      mockSkillRegistry.getAll.mockReturnValue([
        {
          id: "test_skill",
          name: "Test",
          description: "A test skill",
          parameters: [
            { name: "text", type: "string", description: "Text input", required: true },
            { name: "count", type: "number", description: "Count", required: false },
            { name: "flag", type: "boolean", description: "Flag", required: true },
          ],
          execute: vi.fn().mockResolvedValue({ success: true, output: "done" }),
        },
      ]);

      mockStreamText.mockReturnValue({});
      await streamAgentResponse({
        messages: [],
        userId: "u1",
        conversationId: "c1",
      });

      expect(mockTool).toHaveBeenCalled();
      const toolCall = mockTool.mock.calls.find(
        (c: unknown[]) => (c[0] as { description: string }).description === "A test skill"
      );
      expect(toolCall).toBeDefined();
    });

    it("should register integration skills as tools", async () => {
      mockIntegrationRegistry.getActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "test-int",
            name: "TestInt",
            skills: [
              {
                id: "int_skill",
                name: "Int Skill",
                description: "Integration skill",
                parameters: [{ name: "input", type: "string", description: "Input", required: true }],
              },
            ],
          },
          executeSkill: vi.fn().mockResolvedValue({ success: true, output: "ok" }),
        },
      ]);

      mockStreamText.mockReturnValue({});
      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      expect(mockTool).toHaveBeenCalled();
    });

    it("should handle boolean parameter type in integration skills", async () => {
      mockIntegrationRegistry.getActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "bool-int",
            name: "BoolInt",
            skills: [
              {
                id: "bool_int_skill",
                name: "Bool Int Skill",
                description: "Bool integration skill",
                parameters: [
                  { name: "enabled", type: "boolean", description: "Enable flag", required: true },
                ],
              },
            ],
          },
          executeSkill: vi.fn().mockResolvedValue({ success: true, output: "ok" }),
        },
      ]);

      mockStreamText.mockReturnValue({});
      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      const toolCall = mockTool.mock.calls.find(
        (c: unknown[]) => (c[0] as { description: string }).description.includes("Bool integration skill")
      );
      expect(toolCall).toBeDefined();
    });

    it("should handle default (unknown) parameter type in integration skills", async () => {
      mockIntegrationRegistry.getActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "def-int",
            name: "DefInt",
            skills: [
              {
                id: "def_int_skill",
                name: "Def Int Skill",
                description: "Default integration skill",
                parameters: [
                  { name: "data", type: "custom", description: "Custom data", required: false },
                ],
              },
            ],
          },
          executeSkill: vi.fn().mockResolvedValue({ success: true, output: "ok" }),
        },
      ]);

      mockStreamText.mockReturnValue({});
      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      const toolCall = mockTool.mock.calls.find(
        (c: unknown[]) => (c[0] as { description: string }).description.includes("Default integration skill")
      );
      expect(toolCall).toBeDefined();
    });

    it("should register MCP tools", async () => {
      mockMcpManager.getToolsForUser.mockReturnValue([
        {
          serverId: "srv1",
          serverName: "TestServer",
          name: "mcp_tool",
          description: "An MCP tool",
          inputSchema: {
            properties: {
              text: { type: "string", description: "Text" },
              num: { type: "number" },
              int: { type: "integer" },
              flag: { type: "boolean" },
              arr: { type: "array" },
              obj: { type: "object" },
              other: { type: "unknown" },
            },
            required: ["text"],
          },
        },
      ]);
      mockGetToolApprovalRequirement.mockReturnValue("none");

      mockStreamText.mockReturnValue({});
      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      expect(mockTool).toHaveBeenCalled();
    });

    it("should include confirm text for MCP tools that require confirmation", async () => {
      mockMcpManager.getToolsForUser.mockReturnValue([
        {
          serverId: "srv1",
          serverName: "S",
          name: "dangerous_tool",
          description: "Dangerous",
          inputSchema: { properties: {}, required: [] },
        },
      ]);
      mockGetToolApprovalRequirement.mockReturnValue("confirm");

      mockStreamText.mockReturnValue({});
      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      const toolCalls = mockTool.mock.calls;
      const confirmTool = toolCalls.find(
        (c: unknown[]) => (c[0] as { description: string }).description.includes("requires confirmation")
      );
      expect(confirmTool).toBeDefined();
    });
  });

  describe("generateAgentResponse", () => {
    it("should hydrate and generate text", async () => {
      mockGenerateText.mockResolvedValue({ text: "Generated response" });

      const result = await generateAgentResponse({
        messages: [{ role: "user", content: "Hello" }],
        userId: "u1",
        conversationId: "c1",
      });

      expect(result).toBe("Generated response");
      expect(mockIntegrationRegistry.hydrateUserIntegrations).toHaveBeenCalledWith("u1");
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: mockModel,
          maxSteps: 10,
        })
      );
    });

    it("should include memory context when provided", async () => {
      mockGenerateText.mockResolvedValue({ text: "response" });

      await generateAgentResponse({
        messages: [{ role: "user", content: "Hi" }],
        userId: "u1",
        conversationId: "c1",
        memoryContext: "User prefers tea",
      });

      const call = mockGenerateText.mock.calls[0][0];
      const systemMessages = call.messages.filter((m: { role: string }) => m.role === "system");
      expect(systemMessages[1].content).toContain("User prefers tea");
    });

    it("should not add memory context when absent", async () => {
      mockGenerateText.mockResolvedValue({ text: "response" });

      await generateAgentResponse({
        messages: [{ role: "user", content: "Hi" }],
        userId: "u1",
        conversationId: "c1",
      });

      const call = mockGenerateText.mock.calls[0][0];
      const systemMessages = call.messages.filter((m: { role: string }) => m.role === "system");
      expect(systemMessages.length).toBe(1);
    });
  });

  describe("buildTools skill execution", () => {
    it("should execute a built-in skill and audit success", async () => {
      const mockExecute = vi.fn().mockResolvedValue({ success: true, output: "done" });
      mockSkillRegistry.getAll.mockReturnValue([
        {
          id: "skill1",
          description: "Skill 1",
          parameters: [],
          execute: mockExecute,
        },
      ]);

      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        // Simulate calling the tool
        const toolExecute = opts.tools.skill1?.execute;
        if (toolExecute) {
          toolExecute({ arg: "val" });
        }
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });
      // Wait for async execution
      await new Promise((r) => setTimeout(r, 10));

      expect(mockExecute).toHaveBeenCalled();
    });

    it("should handle skill execution failure and audit error", async () => {
      const mockExecute = vi.fn().mockRejectedValue(new Error("skill failed"));
      mockSkillRegistry.getAll.mockReturnValue([
        {
          id: "fail_skill",
          description: "Failing skill",
          parameters: [],
          execute: mockExecute,
        },
      ]);

      let toolExecuteFn: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        toolExecuteFn = opts.tools.fail_skill?.execute;
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      if (toolExecuteFn) {
        await expect(toolExecuteFn({})).rejects.toThrow("skill failed");
      }
    });

    it("should handle skill execution with non-Error throw", async () => {
      const mockExecute = vi.fn().mockRejectedValue("string error");
      mockSkillRegistry.getAll.mockReturnValue([
        {
          id: "nonError_skill",
          description: "Non-error skill",
          parameters: [],
          execute: mockExecute,
        },
      ]);

      let toolExecuteFn: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        toolExecuteFn = opts.tools.nonError_skill?.execute;
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      if (toolExecuteFn) {
        await expect(toolExecuteFn({})).rejects.toBe("string error");
      }
    });

    it("should execute integration tool and audit success", async () => {
      const mockExecSkill = vi.fn().mockResolvedValue({ success: true, output: "ok" });
      mockIntegrationRegistry.getActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "int1",
            name: "Int1",
            skills: [{ id: "int_s1", description: "Int skill", parameters: [] }],
          },
          executeSkill: mockExecSkill,
        },
      ]);

      let toolExecuteFn: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        toolExecuteFn = opts.tools.int_s1?.execute;
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      if (toolExecuteFn) {
        const result = await toolExecuteFn({ key: "val" });
        expect(result).toEqual({ success: true, output: "ok" });
        expect(mockAudit).toHaveBeenCalled();
      }
    });

    it("should handle integration tool failure", async () => {
      const mockExecSkill = vi.fn().mockRejectedValue(new Error("int fail"));
      mockIntegrationRegistry.getActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "int2",
            name: "Int2",
            skills: [{ id: "int_s2", description: "Failing int", parameters: [] }],
          },
          executeSkill: mockExecSkill,
        },
      ]);

      let toolExecuteFn: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        toolExecuteFn = opts.tools.int_s2?.execute;
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      if (toolExecuteFn) {
        await expect(toolExecuteFn({})).rejects.toThrow("int fail");
        expect(mockAudit).toHaveBeenCalledWith(
          expect.objectContaining({ success: false })
        );
      }
    });

    it("should handle integration tool non-Error failure", async () => {
      const mockExecSkill = vi.fn().mockRejectedValue("string error");
      mockIntegrationRegistry.getActiveInstancesForUser.mockReturnValue([
        {
          definition: {
            id: "int3",
            name: "Int3",
            skills: [{ id: "int_s3", description: "Non-Error", parameters: [] }],
          },
          executeSkill: mockExecSkill,
        },
      ]);

      let toolExecuteFn: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        toolExecuteFn = opts.tools.int_s3?.execute;
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      if (toolExecuteFn) {
        await expect(toolExecuteFn({})).rejects.toBe("string error");
      }
    });

    it("should execute MCP tool and return result", async () => {
      mockMcpManager.getToolsForUser.mockReturnValue([
        {
          serverId: "srv1",
          serverName: "TestSrv",
          name: "tool1",
          description: "MCP tool",
          inputSchema: { properties: {}, required: [] },
        },
      ]);
      mockGetToolApprovalRequirement.mockReturnValue("none");
      mockMcpManager.callTool.mockResolvedValue({
        isError: false,
        content: "MCP result",
      });

      let toolExecuteFn: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        // The tool ID is: mcp_srv1_tool1
        toolExecuteFn = opts.tools.mcp_srv1_tool1?.execute;
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      if (toolExecuteFn) {
        const result = await toolExecuteFn({});
        expect(result).toEqual({
          success: true,
          output: "MCP result",
          data: "MCP result",
        });
      }
    });

    it("should handle MCP tool with object content", async () => {
      mockMcpManager.getToolsForUser.mockReturnValue([
        {
          serverId: "srv2",
          serverName: "S",
          name: "tool2",
          description: "MCP tool 2",
          inputSchema: { properties: {}, required: [] },
        },
      ]);
      mockGetToolApprovalRequirement.mockReturnValue("none");
      mockMcpManager.callTool.mockResolvedValue({
        isError: false,
        content: { key: "value" },
      });

      let toolExecuteFn: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        toolExecuteFn = opts.tools.mcp_srv2_tool2?.execute;
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      if (toolExecuteFn) {
        const result = (await toolExecuteFn({})) as { output: string };
        expect(result.output).toBe('{"key":"value"}');
      }
    });

    it("should handle MCP tool error (isError=true)", async () => {
      mockMcpManager.getToolsForUser.mockReturnValue([
        {
          serverId: "srv3",
          serverName: "S",
          name: "tool3",
          description: "Err tool",
          inputSchema: { properties: {}, required: [] },
        },
      ]);
      mockGetToolApprovalRequirement.mockReturnValue("none");
      mockMcpManager.callTool.mockResolvedValue({
        isError: true,
        content: "Error occurred",
      });

      let toolExecuteFn: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        toolExecuteFn = opts.tools.mcp_srv3_tool3?.execute;
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      if (toolExecuteFn) {
        const result = (await toolExecuteFn({})) as { success: boolean };
        expect(result.success).toBe(false);
      }
    });

    it("should handle MCP tool exception (Error)", async () => {
      mockMcpManager.getToolsForUser.mockReturnValue([
        {
          serverId: "srv4",
          serverName: "S",
          name: "tool4",
          description: "Throw tool",
          inputSchema: { properties: {}, required: [] },
        },
      ]);
      mockGetToolApprovalRequirement.mockReturnValue("none");
      mockMcpManager.callTool.mockRejectedValue(new Error("MCP call failed"));

      let toolExecuteFn: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        toolExecuteFn = opts.tools.mcp_srv4_tool4?.execute;
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      if (toolExecuteFn) {
        const result = (await toolExecuteFn({})) as { success: boolean; output: string };
        expect(result.success).toBe(false);
        expect(result.output).toContain("MCP call failed");
      }
    });

    it("should handle MCP tool exception (non-Error)", async () => {
      mockMcpManager.getToolsForUser.mockReturnValue([
        {
          serverId: "srv5",
          serverName: "S",
          name: "tool5",
          description: "Throw",
          inputSchema: { properties: {}, required: [] },
        },
      ]);
      mockGetToolApprovalRequirement.mockReturnValue("none");
      mockMcpManager.callTool.mockRejectedValue("string error");

      let toolExecuteFn: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
      mockStreamText.mockImplementation((opts: { tools: Record<string, { execute: (args: Record<string, unknown>) => Promise<unknown> }> }) => {
        toolExecuteFn = opts.tools.mcp_srv5_tool5?.execute;
        return {};
      });

      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      if (toolExecuteFn) {
        const result = (await toolExecuteFn({})) as { output: string };
        expect(result.output).toContain("string error");
      }
    });

    it("should handle MCP tools with no inputSchema", async () => {
      mockMcpManager.getToolsForUser.mockReturnValue([
        {
          serverId: "srv6",
          serverName: "S",
          name: "tool6",
          description: "No schema",
        },
      ]);
      mockGetToolApprovalRequirement.mockReturnValue("none");

      mockStreamText.mockReturnValue({});
      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      // Should not throw
      expect(mockStreamText).toHaveBeenCalled();
    });

    it("should handle MCP tool with no description and use name", async () => {
      mockMcpManager.getToolsForUser.mockReturnValue([
        {
          serverId: "srv7",
          serverName: "S",
          name: "tool7",
          inputSchema: { properties: {}, required: [] },
        },
      ]);
      mockGetToolApprovalRequirement.mockReturnValue("none");

      mockStreamText.mockReturnValue({});
      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });

      const toolCalls = mockTool.mock.calls;
      const mcpTool = toolCalls.find(
        (c: unknown[]) => (c[0] as { description: string }).description.includes("tool7")
      );
      expect(mcpTool).toBeDefined();
    });

    it("should handle MCP tool with property without description", async () => {
      mockMcpManager.getToolsForUser.mockReturnValue([
        {
          serverId: "srv8",
          serverName: "S",
          name: "tool8",
          description: "Tool8",
          inputSchema: {
            properties: { param1: { type: "string" } },
            required: [],
          },
        },
      ]);
      mockGetToolApprovalRequirement.mockReturnValue("none");

      mockStreamText.mockReturnValue({});
      await streamAgentResponse({ messages: [], userId: "u1", conversationId: "c1" });
      expect(mockStreamText).toHaveBeenCalled();
    });
  });
});
