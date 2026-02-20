/**
 * Multi-Agent System Types
 *
 * Supports three orchestration patterns:
 * 1. Teams   — Agents collaborate in rounds, passing context sequentially
 * 2. Swarms  — Agents work in parallel, results are aggregated
 * 3. Router  — Incoming messages are routed to the best-fit agent
 */

// ─── Agent Definitions ───────────────────────────────────────

export interface AgentPersona {
  /** Unique agent identifier */
  id: string;
  /** Display name */
  name: string;
  /** Role description (e.g., "Senior Software Architect") */
  role: string;
  /** System prompt defining the agent's behavior and expertise */
  systemPrompt: string;
  /** Which AI model to use (defaults to env AI_MODEL) */
  model?: string;
  /** Subset of skill IDs this agent can use (empty = all) */
  skillIds?: string[];
  /** Subset of integration IDs this agent can use (empty = all) */
  integrationIds?: string[];
  /** Max tokens for this agent's responses */
  maxTokens?: number;
  /** Temperature for this agent */
  temperature?: number;
}

export interface AgentMessage {
  agentId: string;
  agentName: string;
  role: "agent" | "user" | "system" | "handoff";
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ─── Team Types ──────────────────────────────────────────────

export type TeamStrategy =
  | "sequential"     // Agents take turns in order
  | "round-robin"    // Multiple rounds of sequential turns
  | "debate"         // Agents argue different positions, synthesizer decides
  | "chain"          // Output of one feeds into the next
  | "supervisor";    // A supervisor agent delegates to workers

export interface TeamDefinition {
  id: string;
  name: string;
  description: string;
  strategy: TeamStrategy;
  agents: AgentPersona[];
  /** For supervisor strategy: which agent is the supervisor */
  supervisorId?: string;
  /** Max rounds for round-robin / debate */
  maxRounds?: number;
  /** Optional final synthesizer agent that combines all outputs */
  synthesizerId?: string;
}

export interface TeamRunConfig {
  teamId: string;
  task: string;
  context?: string;
  userId: string;
  conversationId: string;
  /** Stream intermediate agent outputs */
  streamIntermediate?: boolean;
}

export interface TeamRunResult {
  teamId: string;
  task: string;
  strategy: TeamStrategy;
  /** All messages exchanged between agents */
  transcript: AgentMessage[];
  /** Final synthesized output */
  finalOutput: string;
  /** Execution time in ms */
  durationMs: number;
  /** Per-agent metadata */
  agentResults: {
    agentId: string;
    agentName: string;
    output: string;
    durationMs: number;
  }[];
}

// ─── Swarm Types ─────────────────────────────────────────────

export type SwarmAggregation =
  | "concatenate"    // Join all outputs
  | "vote"           // Majority vote (for classification tasks)
  | "synthesize"     // Use an LLM to synthesize all outputs
  | "best"           // Pick the best output via scoring
  | "merge";         // Merge structured outputs (JSON, etc.)

export interface SwarmDefinition {
  id: string;
  name: string;
  description: string;
  agents: AgentPersona[];
  aggregation: SwarmAggregation;
  /** For 'synthesize' aggregation: which agent synthesizes */
  synthesizerId?: string;
  /** Timeout per agent in ms */
  agentTimeoutMs?: number;
  /** Minimum agents that must complete before aggregating */
  minCompletions?: number;
}

export interface SwarmRunConfig {
  swarmId: string;
  task: string;
  context?: string;
  userId: string;
  conversationId: string;
  /** Per-agent task overrides (agent ID → custom task) */
  agentTasks?: Record<string, string>;
}

export interface SwarmRunResult {
  swarmId: string;
  task: string;
  aggregation: SwarmAggregation;
  finalOutput: string;
  agentResults: {
    agentId: string;
    agentName: string;
    output: string;
    durationMs: number;
    error?: string;
  }[];
  durationMs: number;
}

// ─── Router Types ────────────────────────────────────────────

export interface RouterDefinition {
  id: string;
  name: string;
  description: string;
  agents: AgentPersona[];
  /** Default agent when no good match is found */
  defaultAgentId: string;
  /** Optional: use an LLM to classify intent (vs keyword matching) */
  useAIRouting?: boolean;
}

export interface HandoffRequest {
  fromAgentId: string;
  toAgentId: string;
  reason: string;
  context: string;
}

// ─── Execution Events (for streaming) ────────────────────────

export type AgentEvent =
  | { type: "team_start"; teamId: string; task: string }
  | { type: "swarm_start"; swarmId: string; task: string }
  | { type: "agent_start"; agentId: string; agentName: string }
  | { type: "agent_chunk"; agentId: string; chunk: string }
  | { type: "agent_done"; agentId: string; output: string; durationMs: number }
  | { type: "agent_error"; agentId: string; error: string }
  | { type: "agent_tool_call"; agentId: string; toolName: string; args: Record<string, unknown> }
  | { type: "agent_tool_result"; agentId: string; toolName: string; result: string }
  | { type: "handoff"; from: string; to: string; reason: string }
  | { type: "round_start"; round: number; maxRounds: number }
  | { type: "synthesis_start"; synthesizerId: string }
  | { type: "complete"; finalOutput: string; durationMs: number };
