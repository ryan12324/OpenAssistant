import { generateText, streamText, tool } from "ai";
import { z } from "zod";
import { skillRegistry } from "@/lib/skills/registry";
import { integrationRegistry } from "@/lib/integrations";
import { resolveModelFromString, resolveModelFromSettings } from "@/lib/ai/providers";
import type { AgentPersona, AgentMessage, AgentEvent } from "./types";
import type { SkillContext } from "@/lib/skills/types";

/**
 * AgentNode — A single autonomous agent with its own persona, skills, and execution.
 * Can run independently or as part of a Team/Swarm.
 */
export class AgentNode {
  readonly persona: AgentPersona;

  constructor(persona: AgentPersona) {
    this.persona = persona;
  }

  /**
   * Run the agent with a task and optional conversation history.
   * Returns the full text output.
   */
  async run(params: {
    task: string;
    context?: string;
    history?: AgentMessage[];
    userId: string;
    conversationId: string;
  }): Promise<{ output: string; durationMs: number }> {
    const start = Date.now();
    const ctx: SkillContext = {
      userId: params.userId,
      conversationId: params.conversationId,
    };

    const messages = this.buildMessages(params.task, params.context, params.history);

    const model = this.persona.model
      ? resolveModelFromString(this.persona.model)
      : await resolveModelFromSettings();

    const result = await generateText({
      model,
      messages,
      tools: this.buildTools(ctx),
      maxSteps: 8,
      maxTokens: this.persona.maxTokens,
      temperature: this.persona.temperature,
    });

    return {
      output: result.text,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Run the agent with streaming, emitting events.
   */
  async *runStream(params: {
    task: string;
    context?: string;
    history?: AgentMessage[];
    userId: string;
    conversationId: string;
  }): AsyncGenerator<AgentEvent> {
    const start = Date.now();
    const ctx: SkillContext = {
      userId: params.userId,
      conversationId: params.conversationId,
    };

    yield {
      type: "agent_start",
      agentId: this.persona.id,
      agentName: this.persona.name,
    };

    const messages = this.buildMessages(params.task, params.context, params.history);

    try {
      const streamModel = this.persona.model
        ? resolveModelFromString(this.persona.model)
        : await resolveModelFromSettings();

      const stream = streamText({
        model: streamModel,
        messages,
        tools: this.buildTools(ctx),
        maxSteps: 8,
        maxTokens: this.persona.maxTokens,
        temperature: this.persona.temperature,
      });

      let fullOutput = "";

      for await (const part of stream.textStream) {
        fullOutput += part;
        yield {
          type: "agent_chunk",
          agentId: this.persona.id,
          chunk: part,
        };
      }

      yield {
        type: "agent_done",
        agentId: this.persona.id,
        output: fullOutput,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      yield {
        type: "agent_error",
        agentId: this.persona.id,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check if this agent can handle a given task based on its persona.
   */
  async canHandle(task: string): Promise<{ score: number; reason: string }> {
    // Quick keyword matching based on the role description
    const roleWords = this.persona.role.toLowerCase().split(/\s+/);
    const taskWords = task.toLowerCase().split(/\s+/);
    const overlap = roleWords.filter((w) => taskWords.includes(w)).length;
    const score = Math.min(overlap / Math.max(roleWords.length, 1), 1);

    return {
      score,
      reason: `Role keyword overlap: ${overlap}/${roleWords.length}`,
    };
  }

  private buildMessages(
    task: string,
    context?: string,
    history?: AgentMessage[]
  ) {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: this.persona.systemPrompt },
    ];

    if (context) {
      messages.push({
        role: "system",
        content: `Context from previous agents or user:\n\n${context}`,
      });
    }

    // Include relevant history from other agents
    if (history && history.length > 0) {
      const historyText = history
        .map(
          (m) =>
            `[${m.agentName} (${m.role})]: ${m.content.slice(0, 2000)}`
        )
        .join("\n\n");
      messages.push({
        role: "system",
        content: `Conversation between agents so far:\n\n${historyText}`,
      });
    }

    messages.push({ role: "user", content: task });

    return messages;
  }

  private buildTools(context: SkillContext) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = {};
    const allowedSkills = this.persona.skillIds;
    const allowedIntegrations = this.persona.integrationIds;

    // Add skills (filtered if specified)
    for (const skill of skillRegistry.getAll()) {
      if (allowedSkills && allowedSkills.length > 0 && !allowedSkills.includes(skill.id)) {
        continue;
      }

      const shape: Record<string, z.ZodTypeAny> = {};
      for (const param of skill.parameters) {
        let schema: z.ZodTypeAny;
        switch (param.type) {
          case "number": schema = z.number().describe(param.description); break;
          case "boolean": schema = z.boolean().describe(param.description); break;
          default: schema = z.string().describe(param.description);
        }
        shape[param.name] = param.required ? schema : schema.optional();
      }

      tools[skill.id] = tool({
        description: skill.description,
        parameters: z.object(shape),
        execute: async (args) => skill.execute(args as Record<string, unknown>, context),
      });
    }

    // Add integration skills (filtered if specified)
    for (const instance of integrationRegistry.getActiveInstances()) {
      if (
        allowedIntegrations &&
        allowedIntegrations.length > 0 &&
        !allowedIntegrations.includes(instance.definition.id)
      ) {
        continue;
      }

      for (const integrationSkill of instance.definition.skills) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const param of integrationSkill.parameters) {
          let schema: z.ZodTypeAny;
          switch (param.type) {
            case "number": schema = z.number().describe(param.description); break;
            case "boolean": schema = z.boolean().describe(param.description); break;
            default: schema = z.string().describe(param.description);
          }
          shape[param.name] = param.required ? schema : schema.optional();
        }

        tools[integrationSkill.id] = tool({
          description: `[${instance.definition.name}] ${integrationSkill.description}`,
          parameters: z.object(shape),
          execute: async (args) =>
            instance.executeSkill(integrationSkill.id, args as Record<string, unknown>),
        });
      }
    }

    // Add handoff tool — allows agents to delegate to other team members
    tools["handoff"] = tool({
      description:
        "Hand off the current task to another agent on your team. Use when the task is outside your expertise.",
      parameters: z.object({
        target_agent: z.string().describe("ID or name of the agent to hand off to"),
        reason: z.string().describe("Why you're handing off"),
        context: z.string().describe("Summary of what you've done so far"),
      }),
      execute: async (args) => ({
        success: true,
        output: `Handoff to ${args.target_agent}: ${args.reason}`,
        data: args,
      }),
    });

    return tools;
  }
}
