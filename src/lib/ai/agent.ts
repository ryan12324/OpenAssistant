import { generateText, streamText, tool } from "ai";
import { z } from "zod";
import { skillRegistry } from "@/lib/skills/registry";
import { memoryManager } from "@/lib/rag/memory";
import { integrationRegistry } from "@/lib/integrations";
import { resolveModelFromString } from "@/lib/ai/providers";
import type { SkillContext, SkillResult } from "@/lib/skills/types";

const SYSTEM_PROMPT = `You are OpenAssistant, a personal AI assistant with persistent memory and extensible skills.

You are a proactive, autonomous personal AI assistant. You:

1. **Remember everything**: You have access to a knowledge graph powered by LightRAG. Use the save_memory and recall_memory tools to store and retrieve information about the user.

2. **Learn over time**: Each conversation builds your understanding. Save important facts, preferences, and context using your memory tools.

3. **Use tools proactively**: When a task would benefit from web search, calculations, or memory recall, use your tools without being asked.

4. **Be direct and helpful**: Give concise, actionable responses. You're a teammate, not just a chatbot.

5. **Use integrations**: You have access to connected integrations (chat platforms, smart home, music, etc.). Use them when the user asks to interact with those services.

6. **Agent teams & swarms**: Users can invoke multi-agent teams and swarms via /team and /swarm commands in chat, or use the Teams dashboard. Mention this capability when relevant.

Guidelines:
- At the start of each conversation, recall relevant memories about the user.
- When the user shares preferences, facts about themselves, or important context, save it to memory.
- When asked about past conversations or preferences, check your memory first.
- Use web_search when you need current information.
- Be transparent about what you remember and what you don't.
- You may use multiple tools in sequence to accomplish complex tasks.
- When using integrations (Telegram, Spotify, Hue, etc.), call the appropriate tool directly.`;

/**
 * Build Zod schemas dynamically from skill parameters for the Vercel AI SDK.
 * Includes both built-in skills and skills from connected integrations.
 */
function buildTools(context: SkillContext) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  // Register built-in skills
  for (const skill of skillRegistry.getAll()) {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const param of skill.parameters) {
      let schema: z.ZodTypeAny;
      switch (param.type) {
        case "number":
          schema = z.number().describe(param.description);
          break;
        case "boolean":
          schema = z.boolean().describe(param.description);
          break;
        default:
          schema = z.string().describe(param.description);
      }
      shape[param.name] = param.required ? schema : schema.optional();
    }

    tools[skill.id] = tool({
      description: skill.description,
      parameters: z.object(shape),
      execute: async (args) => {
        const result = await skill.execute(args as Record<string, unknown>, context);
        return result;
      },
    });
  }

  // Register tools from connected integrations
  for (const instance of integrationRegistry.getActiveInstances()) {
    for (const integrationSkill of instance.definition.skills) {
      const shape: Record<string, z.ZodTypeAny> = {};

      for (const param of integrationSkill.parameters) {
        let schema: z.ZodTypeAny;
        switch (param.type) {
          case "number":
            schema = z.number().describe(param.description);
            break;
          case "boolean":
            schema = z.boolean().describe(param.description);
            break;
          default:
            schema = z.string().describe(param.description);
        }
        shape[param.name] = param.required ? schema : schema.optional();
      }

      tools[integrationSkill.id] = tool({
        description: `[${instance.definition.name}] ${integrationSkill.description}`,
        parameters: z.object(shape),
        execute: async (args) => {
          return instance.executeSkill(integrationSkill.id, args as Record<string, unknown>);
        },
      });
    }
  }

  return tools;
}

/**
 * Run the AI agent with streaming for a chat message.
 */
export function streamAgentResponse(params: {
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  userId: string;
  conversationId: string;
  memoryContext?: string;
}) {
  const context: SkillContext = {
    userId: params.userId,
    conversationId: params.conversationId,
  };

  const systemMessages: { role: "system"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (params.memoryContext) {
    systemMessages.push({
      role: "system",
      content: `Here is what you remember about this user from previous conversations:\n\n${params.memoryContext}`,
    });
  }

  const allMessages = [...systemMessages, ...params.messages];

  return streamText({
    model: resolveModelFromString(process.env.AI_MODEL),
    messages: allMessages,
    tools: buildTools(context),
    maxSteps: 10,
  });
}

/**
 * Generate a one-shot response (non-streaming).
 */
export async function generateAgentResponse(params: {
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  userId: string;
  conversationId: string;
  memoryContext?: string;
}): Promise<string> {
  const context: SkillContext = {
    userId: params.userId,
    conversationId: params.conversationId,
  };

  const systemMessages: { role: "system"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (params.memoryContext) {
    systemMessages.push({
      role: "system",
      content: `Here is what you remember about this user:\n\n${params.memoryContext}`,
    });
  }

  const allMessages = [...systemMessages, ...params.messages];

  const result = await generateText({
    model: resolveModelFromString(process.env.AI_MODEL),
    messages: allMessages,
    tools: buildTools(context),
    maxSteps: 10,
  });

  return result.text;
}
