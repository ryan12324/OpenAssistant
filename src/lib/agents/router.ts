import { generateText } from "ai";
import { AgentNode } from "./agent-node";
import { resolveModelFromString } from "@/lib/ai/providers";
import type { RouterDefinition, AgentEvent, AgentPersona } from "./types";

/**
 * AgentRouter — Routes incoming messages to the most appropriate agent.
 * Supports keyword-based and AI-powered intent classification.
 */
export class AgentRouter {
  private definition: RouterDefinition;
  private nodes: Map<string, AgentNode>;

  constructor(definition: RouterDefinition) {
    this.definition = definition;
    this.nodes = new Map();
    for (const agent of definition.agents) {
      this.nodes.set(agent.id, new AgentNode(agent));
    }
  }

  /**
   * Route a message to the best agent and get a response.
   */
  async route(params: {
    message: string;
    userId: string;
    conversationId: string;
    context?: string;
  }): Promise<{
    agentId: string;
    agentName: string;
    output: string;
    durationMs: number;
    routingReason: string;
  }> {
    const { agentId, reason } = await this.classify(params.message);
    const node = this.nodes.get(agentId)!;

    const result = await node.run({
      task: params.message,
      context: params.context,
      userId: params.userId,
      conversationId: params.conversationId,
    });

    return {
      agentId,
      agentName: node.persona.name,
      output: result.output,
      durationMs: result.durationMs,
      routingReason: reason,
    };
  }

  /**
   * Route with streaming events.
   */
  async *routeStream(params: {
    message: string;
    userId: string;
    conversationId: string;
    context?: string;
  }): AsyncGenerator<AgentEvent> {
    const { agentId, reason } = await this.classify(params.message);
    const node = this.nodes.get(agentId)!;

    yield {
      type: "handoff",
      from: "router",
      to: agentId,
      reason,
    };

    for await (const event of node.runStream({
      task: params.message,
      context: params.context,
      userId: params.userId,
      conversationId: params.conversationId,
    })) {
      yield event;
    }
  }

  /**
   * Classify which agent should handle this message.
   */
  private async classify(
    message: string
  ): Promise<{ agentId: string; reason: string }> {
    if (this.definition.useAIRouting) {
      return this.classifyWithAI(message);
    }
    return this.classifyWithKeywords(message);
  }

  private async classifyWithKeywords(
    message: string
  ): Promise<{ agentId: string; reason: string }> {
    const lowerMessage = message.toLowerCase();
    let bestMatch = { agentId: this.definition.defaultAgentId, score: 0 };

    for (const agent of this.definition.agents) {
      const node = this.nodes.get(agent.id)!;
      const { score } = await node.canHandle(message);
      if (score > bestMatch.score) {
        bestMatch = { agentId: agent.id, score };
      }
    }

    const selectedAgent = this.nodes.get(bestMatch.agentId)!;
    return {
      agentId: bestMatch.agentId,
      reason:
        bestMatch.score > 0
          ? `Best keyword match: ${selectedAgent.persona.name} (score: ${bestMatch.score.toFixed(2)})`
          : `Default agent: ${selectedAgent.persona.name}`,
    };
  }

  private async classifyWithAI(
    message: string
  ): Promise<{ agentId: string; reason: string }> {
    const agentDescriptions = this.definition.agents
      .map((a) => `- ${a.id}: ${a.name} — ${a.role}`)
      .join("\n");

    const result = await generateText({
      model: resolveModelFromString(process.env.AI_MODEL),
      messages: [
        {
          role: "system",
          content: `You are a message router. Given a user message, decide which agent should handle it.

Available agents:
${agentDescriptions}

Default agent: ${this.definition.defaultAgentId}

Respond with ONLY a JSON object: {"agent_id": "...", "reason": "..."}`,
        },
        { role: "user", content: message },
      ],
      maxTokens: 200,
    });

    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.agent_id && this.nodes.has(parsed.agent_id)) {
          return { agentId: parsed.agent_id, reason: parsed.reason || "AI routing" };
        }
      }
    } catch {
      // Fall through to default
    }

    return {
      agentId: this.definition.defaultAgentId,
      reason: "AI routing fallback to default agent",
    };
  }
}
