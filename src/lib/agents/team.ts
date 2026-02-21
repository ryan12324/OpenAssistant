import { generateText } from "ai";
import { resolveModelFromSettings } from "@/lib/ai/providers";
import { initializeNodes, recordAgentExecution } from "./utils";
import type { TranscriptEntry, AgentResult } from "./utils";
import type {
  TeamDefinition,
  TeamRunConfig,
  TeamRunResult,
  AgentMessage,
  AgentEvent,
} from "./types";

/**
 * TeamOrchestrator — Manages a team of agents collaborating on a task.
 *
 * Strategies:
 * - sequential:  Each agent runs once in order, building on the previous output
 * - round-robin: Agents take turns for multiple rounds
 * - debate:      Agents argue positions, a synthesizer picks the best
 * - chain:       Pipeline — output of agent N becomes input of agent N+1
 * - supervisor:  A supervisor decomposes the task and delegates to workers
 */
export class TeamOrchestrator {
  private definition: TeamDefinition;
  private nodes: Map<string, AgentNode>;

  constructor(definition: TeamDefinition) {
    this.definition = definition;
    this.nodes = initializeNodes(definition.agents);
  }

  async run(config: TeamRunConfig): Promise<TeamRunResult> {
    const start = Date.now();

    switch (this.definition.strategy) {
      case "sequential":
        return this.runSequential(config, start);
      case "round-robin":
        return this.runRoundRobin(config, start);
      case "debate":
        return this.runDebate(config, start);
      case "chain":
        return this.runChain(config, start);
      case "supervisor":
        return this.runSupervisor(config, start);
      default:
        return this.runSequential(config, start);
    }
  }

  /**
   * Stream execution events in real-time.
   */
  async *runStream(config: TeamRunConfig): AsyncGenerator<AgentEvent> {
    yield {
      type: "team_start",
      teamId: this.definition.id,
      task: config.task,
    };

    const start = Date.now();
    const transcript: TranscriptEntry[] = [];
    const agentResults: AgentResult[] = [];

    const agentOrder = this.definition.agents;

    for (let i = 0; i < agentOrder.length; i++) {
      const agent = agentOrder[i];
      const node = this.nodes.get(agent.id)!;

      const context = i === 0
        ? config.context
        : agentResults[agentResults.length - 1]?.output;

      for await (const event of node.runStream({
        task: config.task,
        context,
        history: transcript,
        userId: config.userId,
        conversationId: config.conversationId,
      })) {
        yield event;

        if (event.type === "agent_done") {
          recordAgentExecution(transcript, agentResults, agent, {
            output: event.output,
            durationMs: event.durationMs,
          });
        }
      }
    }

    // Synthesize if needed
    const finalOutput = await this.synthesize(
      config.task,
      agentResults,
      transcript
    );

    yield {
      type: "complete",
      finalOutput,
      durationMs: Date.now() - start,
    };
  }

  // ─── Strategy Implementations ──────────────────────────────

  private async runSequential(
    config: TeamRunConfig,
    start: number
  ): Promise<TeamRunResult> {
    const transcript: TranscriptEntry[] = [];
    const agentResults: AgentResult[] = [];

    let currentContext = config.context || "";

    for (const agent of this.definition.agents) {
      const node = this.nodes.get(agent.id)!;
      const result = await node.run({
        task: config.task,
        context: currentContext,
        history: transcript,
        userId: config.userId,
        conversationId: config.conversationId,
      });

      recordAgentExecution(transcript, agentResults, agent, result);

      currentContext = result.output;
    }

    const finalOutput = await this.synthesize(config.task, agentResults, transcript);

    return {
      teamId: this.definition.id,
      task: config.task,
      strategy: "sequential",
      transcript,
      finalOutput,
      durationMs: Date.now() - start,
      agentResults,
    };
  }

  private async runRoundRobin(
    config: TeamRunConfig,
    start: number
  ): Promise<TeamRunResult> {
    const maxRounds = this.definition.maxRounds || 3;
    const transcript: TranscriptEntry[] = [];
    const agentResults: AgentResult[] = [];

    for (let round = 0; round < maxRounds; round++) {
      for (const agent of this.definition.agents) {
        const node = this.nodes.get(agent.id)!;

        const roundTask =
          round === 0
            ? config.task
            : `Continue the discussion. Original task: ${config.task}\n\nProvide your updated perspective based on the conversation so far. Round ${round + 1}/${maxRounds}.`;

        const result = await node.run({
          task: roundTask,
          context: config.context,
          history: transcript,
          userId: config.userId,
          conversationId: config.conversationId,
        });

        recordAgentExecution(transcript, agentResults, agent, result);
      }
    }

    const finalOutput = await this.synthesize(config.task, agentResults, transcript);

    return {
      teamId: this.definition.id,
      task: config.task,
      strategy: "round-robin",
      transcript,
      finalOutput,
      durationMs: Date.now() - start,
      agentResults,
    };
  }

  private async runDebate(
    config: TeamRunConfig,
    start: number
  ): Promise<TeamRunResult> {
    const maxRounds = this.definition.maxRounds || 2;
    const transcript: AgentMessage[] = [];
    const agentResults: TeamRunResult["agentResults"] = [];

    // Each agent takes an initial position
    for (const agent of this.definition.agents) {
      const node = this.nodes.get(agent.id)!;
      const result = await node.run({
        task: `${config.task}\n\nTake a clear position and argue for it. Be specific and provide evidence.`,
        context: config.context,
        history: transcript,
        userId: config.userId,
        conversationId: config.conversationId,
      });

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

    // Rebuttal rounds
    for (let round = 0; round < maxRounds - 1; round++) {
      for (const agent of this.definition.agents) {
        const node = this.nodes.get(agent.id)!;
        const result = await node.run({
          task: `Review the other agents' positions and provide a rebuttal or update your position.\n\nOriginal task: ${config.task}`,
          context: config.context,
          history: transcript,
          userId: config.userId,
          conversationId: config.conversationId,
        });

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
    }

    const finalOutput = await this.synthesize(config.task, agentResults, transcript);

    return {
      teamId: this.definition.id,
      task: config.task,
      strategy: "debate",
      transcript,
      finalOutput,
      durationMs: Date.now() - start,
      agentResults,
    };
  }

  private async runChain(
    config: TeamRunConfig,
    start: number
  ): Promise<TeamRunResult> {
    const transcript: AgentMessage[] = [];
    const agentResults: TeamRunResult["agentResults"] = [];

    let pipelineInput = config.task;

    for (const agent of this.definition.agents) {
      const node = this.nodes.get(agent.id)!;
      const result = await node.run({
        task: pipelineInput,
        context: config.context,
        userId: config.userId,
        conversationId: config.conversationId,
      });

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

      // Output of this agent becomes the input for the next
      pipelineInput = result.output;
    }

    return {
      teamId: this.definition.id,
      task: config.task,
      strategy: "chain",
      transcript,
      finalOutput: agentResults[agentResults.length - 1]?.output || "",
      durationMs: Date.now() - start,
      agentResults,
    };
  }

  private async runSupervisor(
    config: TeamRunConfig,
    start: number
  ): Promise<TeamRunResult> {
    const transcript: AgentMessage[] = [];
    const agentResults: TeamRunResult["agentResults"] = [];
    const supervisorId = this.definition.supervisorId || this.definition.agents[0]?.id;
    const supervisor = this.nodes.get(supervisorId!);

    if (!supervisor) throw new Error("Supervisor agent not found");

    const workers = this.definition.agents.filter((a) => a.id !== supervisorId);
    const workerList = workers.map((w) => `- ${w.id}: ${w.name} — ${w.role}`).join("\n");

    // Step 1: Supervisor decomposes the task
    const planResult = await supervisor.run({
      task: `You are the supervisor. Decompose this task into subtasks and assign them to your workers.

Task: ${config.task}

Available workers:
${workerList}

Respond with a JSON array of assignments:
[{"agent_id": "...", "subtask": "..."}]

Only respond with the JSON array, nothing else.`,
      context: config.context,
      userId: config.userId,
      conversationId: config.conversationId,
    });

    transcript.push({
      agentId: supervisorId!,
      agentName: supervisor.persona.name,
      role: "agent",
      content: planResult.output,
      timestamp: new Date(),
    });

    // Parse assignments
    let assignments: { agent_id: string; subtask: string }[] = [];
    try {
      const jsonMatch = planResult.output.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        assignments = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // If parsing fails, give the whole task to all workers
      assignments = workers.map((w) => ({ agent_id: w.id, subtask: config.task }));
    }

    // Step 2: Workers execute their subtasks in parallel
    const workerPromises = assignments.map(async (assignment) => {
      const node = this.nodes.get(assignment.agent_id);
      if (!node) return null;

      const result = await node.run({
        task: assignment.subtask,
        context: config.context,
        history: transcript,
        userId: config.userId,
        conversationId: config.conversationId,
      });

      return {
        agentId: assignment.agent_id,
        agentName: node.persona.name,
        output: result.output,
        durationMs: result.durationMs,
        subtask: assignment.subtask,
      };
    });

    const workerResults = (await Promise.all(workerPromises)).filter(Boolean) as {
      agentId: string;
      agentName: string;
      output: string;
      durationMs: number;
      subtask: string;
    }[];

    for (const wr of workerResults) {
      transcript.push({
        agentId: wr.agentId,
        agentName: wr.agentName,
        role: "agent",
        content: `[Subtask: ${wr.subtask}]\n\n${wr.output}`,
        timestamp: new Date(),
      });
      agentResults.push(wr);
    }

    // Step 3: Supervisor synthesizes the results
    const synthesisResult = await supervisor.run({
      task: `You are the supervisor. Your workers have completed their subtasks. Synthesize their outputs into a cohesive final response.

Original task: ${config.task}`,
      history: transcript,
      userId: config.userId,
      conversationId: config.conversationId,
    });

    agentResults.push({
      agentId: supervisorId!,
      agentName: supervisor.persona.name,
      output: synthesisResult.output,
      durationMs: synthesisResult.durationMs,
    });

    return {
      teamId: this.definition.id,
      task: config.task,
      strategy: "supervisor",
      transcript,
      finalOutput: synthesisResult.output,
      durationMs: Date.now() - start,
      agentResults,
    };
  }

  // ─── Synthesis ─────────────────────────────────────────────

  private async synthesize(
    task: string,
    agentResults: TeamRunResult["agentResults"],
    transcript: AgentMessage[]
  ): Promise<string> {
    // If there's a designated synthesizer, use it
    if (this.definition.synthesizerId) {
      const synthesizer = this.nodes.get(this.definition.synthesizerId);
      if (synthesizer) {
        const result = await synthesizer.run({
          task: `Synthesize the following agent outputs into a single, cohesive response for the user.

Original task: ${task}`,
          history: transcript,
          userId: "system",
          conversationId: "synthesis",
        });
        return result.output;
      }
    }

    // If only one agent, return its output directly
    if (agentResults.length === 1) {
      return agentResults[0].output;
    }

    // Otherwise, use LLM to synthesize
    const agentOutputs = agentResults
      .map((r) => `**${r.agentName}:**\n${r.output}`)
      .join("\n\n---\n\n");

    const result = await generateText({
      model: await resolveModelFromSettings(),
      messages: [
        {
          role: "system",
          content:
            "You are a synthesis agent. Combine the following agent outputs into a single, clear, and comprehensive response. Preserve the best ideas from each agent. Be concise.",
        },
        {
          role: "user",
          content: `Task: ${task}\n\nAgent outputs:\n\n${agentOutputs}`,
        },
      ],
      maxTokens: 4096,
    });

    return result.text;
  }
}
