import { generateText, streamText, tool, type CoreMessage } from "ai";
import { z } from "zod";
import { skillRegistry } from "@/lib/skills/registry";
import { memoryManager } from "@/lib/rag/memory";
import { integrationRegistry } from "@/lib/integrations";
import { resolveModelFromSettings } from "@/lib/ai/providers";
import { audit } from "@/lib/audit";
import { mcpManager } from "@/lib/mcp/client";
import { getToolApprovalRequirement } from "@/lib/mcp/permissions";
import { buildZodSchemaFromParams, buildZodSchemaFromJsonSchema } from "@/lib/schema-builder";
import type { SkillContext, SkillResult } from "@/lib/skills/types";
import { getLogger } from "@/lib/logger";

const log = getLogger("ai.agent");

const SYSTEM_PROMPT = `You are OpenAssistant, a personal AI assistant with persistent memory and extensible skills.

You are a proactive, autonomous personal AI assistant. You:

1. **Remember everything**: You have access to a knowledge graph powered by LightRAG. Use the save_memory and recall_memory tools to store and retrieve information about the user.

2. **Learn over time**: Each conversation builds your understanding. Save important facts, preferences, and context using your memory tools.

3. **Use tools proactively**: When a task would benefit from web search, calculations, or memory recall, use your tools without being asked.

4. **Be direct and helpful**: Give concise, actionable responses. You're a teammate, not just a chatbot.

5. **Use integrations**: You have access to connected integrations (chat platforms, smart home, music, etc.). Use them when the user asks to interact with those services.

6. **Spawn agent teams & swarms**: You can directly invoke multi-agent teams and swarms using the spawn_team and spawn_swarm tools. Use them when a task benefits from multiple expert perspectives, collaborative analysis, debate, or parallel evaluation. Available teams: research-team, code-review-team, planning-team, debate-team, creative-team. Available swarms: analysis-swarm, fact-check-swarm, translation-swarm.

Guidelines:
- At the start of each conversation, recall relevant memories about the user.
- When the user shares preferences, facts about themselves, or important context, save it to memory.
- When asked about past conversations or preferences, check your memory first.
- Use web_search when you need current information.
- Be transparent about what you remember and what you don't.
- You may use multiple tools in sequence to accomplish complex tasks.
- When using integrations (Telegram, Spotify, Hue, etc.), call the appropriate tool directly.

7. **Use MCP tools**: You have access to tools from connected MCP servers (external services). These tools are prefixed with "mcp_" in their names. Use them when relevant to the user's request.`;

/**
 * Hydrates integrations, MCP connections, and builds initial system messages.
 */
async function initializeAgentContext(
  userId: string,
  memoryContext: string | undefined,
  systemPrompt: string
): Promise<{ role: "system"; content: string }[]> {
  log.debug("hydrating user integrations", { userId });
  await integrationRegistry.hydrateUserIntegrations(userId);
  log.debug("hydrating MCP connections", { userId });
  await mcpManager.hydrateUserConnections(userId);
  await mcpManager.hydrateGlobalConnections();

  const messages: { role: "system"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];
  if (memoryContext) {
    messages.push({ role: "system", content: `Here is what you remember about this user:\n${memoryContext}` });
  }
  return messages;
}

/**
 * Build Zod schemas dynamically from skill parameters for the Vercel AI SDK.
 * Includes both built-in skills and skills from connected integrations.
 */
function buildTools(context: SkillContext) {
  log.debug("buildTools started", { userId: context.userId });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  // Register built-in skills
  for (const skill of skillRegistry.getAll()) {
    log.debug("registering built-in skill", { skillId: skill.id });

    const shape = buildZodSchemaFromParams(skill.parameters);

    tools[skill.id] = tool({
      description: skill.description,
      parameters: z.object(shape),
      execute: async (args) => {
        log.info("executing built-in skill", { skillId: skill.id, userId: context.userId });
        const startMs = Date.now();
        let result: SkillResult;
        try {
          result = await skill.execute(args as Record<string, unknown>, context);
          const durationMs = Date.now() - startMs;
          log.info("built-in skill completed", {
            skillId: skill.id,
            userId: context.userId,
            durationMs,
            success: result.success,
          });
          audit({
            userId: context.userId,
            action: "skill_execute",
            skillId: skill.id,
            input: args,
            output: result.output,
            durationMs,
            success: result.success,
          });
        } catch (err) {
          const durationMs = Date.now() - startMs;
          log.error("built-in skill failed with exception", {
            skillId: skill.id,
            userId: context.userId,
            durationMs,
            error: err instanceof Error ? err.message : String(err),
          });
          audit({
            userId: context.userId,
            action: "skill_execute",
            skillId: skill.id,
            input: args,
            output: err instanceof Error ? err.message : String(err),
            durationMs,
            success: false,
          });
          throw err;
        }
        return result;
      },
    });
  }

  // Register tools from connected integrations (user-scoped)
  for (const instance of integrationRegistry.getActiveInstancesForUser(context.userId)) {
    for (const integrationSkill of instance.definition.skills) {
      log.debug("registering integration tool", {
        toolId: integrationSkill.id,
        integrationId: instance.definition.id,
        integrationName: instance.definition.name,
      });

      const shape = buildZodSchemaFromParams(integrationSkill.parameters);

      tools[integrationSkill.id] = tool({
        description: `[${instance.definition.name}] ${integrationSkill.description}`,
        parameters: z.object(shape),
        execute: async (args) => {
          log.info("executing integration tool", {
            toolId: integrationSkill.id,
            integrationId: instance.definition.id,
            userId: context.userId,
          });
          const startMs = Date.now();
          try {
            const result = await instance.executeSkill(integrationSkill.id, args as Record<string, unknown>);
            const durationMs = Date.now() - startMs;
            log.info("integration tool completed", {
              toolId: integrationSkill.id,
              integrationId: instance.definition.id,
              userId: context.userId,
              durationMs,
              success: true,
            });
            audit({
              userId: context.userId,
              action: "tool_call",
              skillId: integrationSkill.id,
              source: instance.definition.id,
              input: args,
              output: result,
              durationMs,
            });
            return result;
          } catch (err) {
            const durationMs = Date.now() - startMs;
            log.error("integration tool failed with exception", {
              toolId: integrationSkill.id,
              integrationId: instance.definition.id,
              userId: context.userId,
              durationMs,
              error: err instanceof Error ? err.message : String(err),
            });
            audit({
              userId: context.userId,
              action: "tool_call",
              skillId: integrationSkill.id,
              source: instance.definition.id,
              input: args,
              output: err instanceof Error ? err.message : String(err),
              durationMs,
              success: false,
            });
            throw err;
          }
        },
      });
    }
  }

  // Register tools from connected MCP servers
  const mcpTools = mcpManager.getToolsForUser(context.userId);
  for (const mcpTool of mcpTools) {
    const toolId = `mcp_${mcpTool.serverId}_${mcpTool.name}`.replace(/[^a-zA-Z0-9_]/g, "_");

    log.debug("registering MCP tool", {
      toolId,
      mcpServerId: mcpTool.serverId,
      mcpServerName: mcpTool.serverName,
      mcpToolName: mcpTool.name,
    });

    // Convert JSON Schema to Zod schema
    const props = (mcpTool.inputSchema?.properties || {}) as Record<
      string,
      { type?: string; description?: string }
    >;
    const required = (mcpTool.inputSchema?.required || []) as string[];

    const shape = buildZodSchemaFromJsonSchema(props, required);

    const approval = getToolApprovalRequirement(mcpTool);
    const desc = [
      `[MCP: ${mcpTool.serverName}]`,
      mcpTool.description || mcpTool.name,
      approval === "confirm" ? "(requires confirmation)" : "",
    ]
      .filter(Boolean)
      .join(" ");

    tools[toolId] = tool({
      description: desc,
      parameters: z.object(shape),
      execute: async (args) => {
        log.info("executing MCP tool", {
          toolId,
          mcpServerId: mcpTool.serverId,
          mcpToolName: mcpTool.name,
          userId: context.userId,
        });
        const startMs = Date.now();
        try {
          const result = await mcpManager.callTool(
            mcpTool.serverId,
            mcpTool.name,
            args as Record<string, unknown>
          );
          const durationMs = Date.now() - startMs;
          log.info("MCP tool completed", {
            toolId,
            mcpServerId: mcpTool.serverId,
            mcpToolName: mcpTool.name,
            userId: context.userId,
            durationMs,
            success: !result.isError,
          });
          audit({
            userId: context.userId,
            action: "mcp_tool_call",
            skillId: mcpTool.name,
            source: `mcp:${mcpTool.serverId}`,
            input: args,
            output: result.content,
            durationMs,
            success: !result.isError,
          });
          return {
            success: !result.isError,
            output:
              typeof result.content === "string"
                ? result.content
                : JSON.stringify(result.content),
            data: result.content,
          };
        } catch (err) {
          const durationMs = Date.now() - startMs;
          log.error("MCP tool failed with exception", {
            toolId,
            mcpServerId: mcpTool.serverId,
            mcpToolName: mcpTool.name,
            userId: context.userId,
            durationMs,
            error: err instanceof Error ? err.message : String(err),
          });
          audit({
            userId: context.userId,
            action: "mcp_tool_call",
            skillId: mcpTool.name,
            source: `mcp:${mcpTool.serverId}`,
            input: args,
            output: err instanceof Error ? err.message : String(err),
            durationMs,
            success: false,
          });
          return {
            success: false,
            output: `MCP tool error: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    });
  }

  const totalToolCount = Object.keys(tools).length;
  log.info("buildTools completed", { userId: context.userId, totalToolCount });

  return tools;
}

/**
 * Run the AI agent with streaming for a chat message.
 */
export async function streamAgentResponse(params: {
  messages: CoreMessage[];
  userId: string;
  conversationId: string;
  memoryContext?: string;
}) {
  log.info("streamAgentResponse started", {
    userId: params.userId,
    conversationId: params.conversationId,
    messageCount: params.messages.length,
    hasMemoryContext: !!params.memoryContext,
  });

  const context: SkillContext = {
    userId: params.userId,
    conversationId: params.conversationId,
  };

  const systemMessages = await initializeAgentContext(
    params.userId,
    params.memoryContext,
    SYSTEM_PROMPT,
  );

  const allMessages = [...systemMessages, ...params.messages];

  const model = await resolveModelFromSettings();
  log.info("starting stream", {
    userId: params.userId,
    conversationId: params.conversationId,
    model: String(model.modelId ?? model),
  });

  return streamText({
    model,
    messages: allMessages,
    tools: buildTools(context),
    maxSteps: 10,
  });
}

/**
 * Generate a one-shot response (non-streaming).
 */
export async function generateAgentResponse(params: {
  messages: CoreMessage[];
  userId: string;
  conversationId: string;
  memoryContext?: string;
}): Promise<string> {
  log.info("generateAgentResponse started", {
    userId: params.userId,
    conversationId: params.conversationId,
    messageCount: params.messages.length,
    hasMemoryContext: !!params.memoryContext,
  });

  const context: SkillContext = {
    userId: params.userId,
    conversationId: params.conversationId,
  };

  const systemMessages = await initializeAgentContext(
    params.userId,
    params.memoryContext,
    SYSTEM_PROMPT,
  );

  const allMessages = [...systemMessages, ...params.messages];

  const generateStartMs = Date.now();
  const result = await generateText({
    model: await resolveModelFromSettings(),
    messages: allMessages,
    tools: buildTools(context),
    maxSteps: 10,
  });
  const generateDurationMs = Date.now() - generateStartMs;

  log.info("generateAgentResponse completed", {
    userId: params.userId,
    conversationId: params.conversationId,
    responseLength: result.text.length,
    durationMs: generateDurationMs,
  });

  return result.text;
}
