import { generateText } from "ai";
import { AgentNode } from "./agent-node";
import { resolveModelFromSettings } from "@/lib/ai/providers";
import { initializeNodes } from "./utils";
import type {
  SwarmDefinition,
  SwarmRunConfig,
  SwarmRunResult,
  AgentEvent,
} from "./types";

/**
 * SwarmOrchestrator — Runs multiple agents in parallel on the same (or different) tasks.
 *
 * Aggregation modes:
 * - concatenate: Join all outputs
 * - vote:        Majority vote (for classification)
 * - synthesize:  LLM combines outputs
 * - best:        Pick best output by scoring
 * - merge:       Merge structured (JSON) outputs
 */
export class SwarmOrchestrator {
  private definition: SwarmDefinition;
  private nodes: Map<string, AgentNode>;

  constructor(definition: SwarmDefinition) {
    this.definition = definition;
    this.nodes = initializeNodes(definition.agents);
  }

  /**
   * Run all agents in parallel and aggregate results.
   */
  async run(config: SwarmRunConfig): Promise<SwarmRunResult> {
    const start = Date.now();

    const timeoutMs = this.definition.agentTimeoutMs ?? Number(process.env.SWARM_TIMEOUT_MS ?? "60000");

    // Launch all agents in parallel
    const promises = this.definition.agents.map(async (agent) => {
      const node = this.nodes.get(agent.id)!;
      const agentStart = Date.now();
      const task = config.agentTasks?.[agent.id] || config.task;

      try {
        const result = await Promise.race([
          node.run({
            task,
            context: config.context,
            userId: config.userId,
            conversationId: config.conversationId,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Agent timeout")), timeoutMs)
          ),
        ]);

        return {
          agentId: agent.id,
          agentName: agent.name,
          output: result.output,
          durationMs: result.durationMs,
        };
      } catch (error) {
        return {
          agentId: agent.id,
          agentName: agent.name,
          output: "",
          durationMs: Date.now() - agentStart,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    const agentResults = await Promise.all(promises);

    // Check minimum completions
    const successful = agentResults.filter((r) => !r.error);
    const minCompletions = this.definition.minCompletions || 1;
    if (successful.length < minCompletions) {
      return {
        swarmId: this.definition.id,
        task: config.task,
        aggregation: this.definition.aggregation,
        finalOutput: `Swarm failed: Only ${successful.length}/${minCompletions} agents completed successfully.`,
        agentResults,
        durationMs: Date.now() - start,
      };
    }

    // Aggregate
    const finalOutput = await this.aggregate(config.task, successful);

    return {
      swarmId: this.definition.id,
      task: config.task,
      aggregation: this.definition.aggregation,
      finalOutput,
      agentResults,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Stream execution events from all agents running in parallel.
   */
  async *runStream(config: SwarmRunConfig): AsyncGenerator<AgentEvent> {
    yield {
      type: "swarm_start",
      swarmId: this.definition.id,
      task: config.task,
    };

    const start = Date.now();
    const agentResults: SwarmRunResult["agentResults"] = [];

    // Run all agents in parallel, collecting events
    const agentGenerators = this.definition.agents.map((agent) => {
      const node = this.nodes.get(agent.id)!;
      const task = config.agentTasks?.[agent.id] || config.task;
      return {
        agentId: agent.id,
        agentName: agent.name,
        generator: node.runStream({
          task,
          context: config.context,
          userId: config.userId,
          conversationId: config.conversationId,
        }),
      };
    });

    // Process all generators concurrently by polling
    const activeGenerators = new Map(
      agentGenerators.map((ag) => [ag.agentId, ag])
    );

    while (activeGenerators.size > 0) {
      for (const [agentId, ag] of activeGenerators) {
        const { value, done } = await ag.generator.next();
        if (done) {
          activeGenerators.delete(agentId);
          continue;
        }
        yield value;

        if (value.type === "agent_done") {
          agentResults.push({
            agentId: value.agentId,
            agentName: ag.agentName,
            output: value.output,
            durationMs: value.durationMs,
          });
        }
      }
    }

    // Aggregate
    const successful = agentResults.filter((r) => !("error" in r));

    if (this.definition.aggregation === "synthesize") {
      yield {
        type: "synthesis_start",
        synthesizerId: this.definition.synthesizerId || "system",
      };
    }

    const finalOutput = await this.aggregate(config.task, successful);

    yield {
      type: "complete",
      finalOutput,
      durationMs: Date.now() - start,
    };
  }

  // ─── Aggregation ───────────────────────────────────────────

  private async aggregate(
    task: string,
    results: { agentId: string; agentName: string; output: string }[]
  ): Promise<string> {
    if (results.length === 0) return "No agents produced output.";
    if (results.length === 1) return results[0].output;

    switch (this.definition.aggregation) {
      case "concatenate":
        return results
          .map((r) => `## ${r.agentName}\n\n${r.output}`)
          .join("\n\n---\n\n");

      case "vote":
        return this.aggregateVote(results);

      case "synthesize":
        return this.aggregateSynthesize(task, results);

      case "best":
        return this.aggregateBest(task, results);

      case "merge":
        return this.aggregateMerge(results);

      default:
        return results.map((r) => r.output).join("\n\n");
    }
  }

  private aggregateVote(
    results: { agentName: string; output: string }[]
  ): string {
    // Simple majority vote — count normalized outputs
    const votes = new Map<string, number>();
    for (const r of results) {
      const normalized = r.output.trim().toLowerCase();
      votes.set(normalized, (votes.get(normalized) || 0) + 1);
    }

    let maxVotes = 0;
    let winner = "";
    for (const [output, count] of votes) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = output;
      }
    }

    const originalCase = results.find(
      (r) => r.output.trim().toLowerCase() === winner
    )?.output || winner;

    return `${originalCase}\n\n(Consensus: ${maxVotes}/${results.length} agents agreed)`;
  }

  private async aggregateSynthesize(
    task: string,
    results: { agentName: string; output: string }[]
  ): Promise<string> {
    const outputs = results
      .map((r) => `**${r.agentName}:**\n${r.output}`)
      .join("\n\n---\n\n");

    // Use designated synthesizer or default LLM
    if (this.definition.synthesizerId) {
      const synthesizer = this.nodes.get(this.definition.synthesizerId);
      if (synthesizer) {
        const result = await synthesizer.run({
          task: `Synthesize these parallel agent outputs into a single comprehensive response.\n\nOriginal task: ${task}\n\nAgent outputs:\n\n${outputs}`,
          userId: "system",
          conversationId: "synthesis",
        });
        return result.output;
      }
    }

    const result = await generateText({
      model: await resolveModelFromSettings(),
      messages: [
        {
          role: "system",
          content:
            "You are a synthesis agent. Combine these parallel agent outputs into a single, clear response. Take the best elements from each.",
        },
        { role: "user", content: `Task: ${task}\n\nOutputs:\n\n${outputs}` },
      ],
    });
    return result.text;
  }

  private async aggregateBest(
    task: string,
    results: { agentName: string; output: string }[]
  ): Promise<string> {
    const outputs = results
      .map((r, i) => `Option ${i + 1} (${r.agentName}):\n${r.output}`)
      .join("\n\n---\n\n");

    const result = await generateText({
      model: await resolveModelFromSettings(),
      messages: [
        {
          role: "system",
          content:
            "You are a judge. Pick the best response from the options below and return it. Briefly explain why at the end.",
        },
        { role: "user", content: `Task: ${task}\n\nOptions:\n\n${outputs}` },
      ],
    });
    return result.text;
  }

  private aggregateMerge(
    results: { agentName: string; output: string }[]
  ): string {
    // Try to merge JSON outputs
    const merged: Record<string, unknown> = {};
    for (const r of results) {
      try {
        const json = JSON.parse(r.output);
        Object.assign(merged, json);
      } catch {
        // If not valid JSON, store as a named entry
        merged[r.agentName] = r.output;
      }
    }
    return JSON.stringify(merged, null, 2);
  }
}
