import { AgentNode } from "./agent-node";
import type { AgentPersona } from "./types";

/** Shared transcript entry */
export interface TranscriptEntry {
  agentId: string;
  agentName: string;
  role: "agent" | "user" | "system" | "handoff";
  content: string;
  timestamp: Date;
}

/** Shared agent result */
export interface AgentResult {
  agentId: string;
  agentName: string;
  output: string;
  durationMs: number;
}

/**
 * Initialize agent nodes from persona definitions.
 * Used by TeamOrchestrator, RouterOrchestrator, and SwarmOrchestrator.
 */
export function initializeNodes(agents: AgentPersona[]): Map<string, AgentNode> {
  const nodes = new Map<string, AgentNode>();
  for (const agent of agents) {
    nodes.set(agent.id, new AgentNode(agent));
  }
  return nodes;
}

/**
 * Record an agent execution result into transcript and results arrays.
 */
export function recordAgentExecution(
  transcript: TranscriptEntry[],
  agentResults: AgentResult[],
  agent: { id: string; name: string },
  result: { output: string; durationMs: number },
): void {
  transcript.push({
    agentId: agent.id,
    agentName: agent.name,
    role: "agent",
    content: result.output,
    timestamp: new Date(),
  });
  agentResults.push({
    agentId: agent.id,
    agentName: agent.name,
    output: result.output,
    durationMs: result.durationMs,
  });
}
