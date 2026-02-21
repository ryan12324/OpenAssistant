import type { SkillDefinition } from "../types";
import { TeamOrchestrator } from "@/lib/agents/team";
import { SwarmOrchestrator } from "@/lib/agents/swarm";
import { presetTeams, presetSwarms } from "@/lib/agents/presets";

const teamList = presetTeams.map((t) => `"${t.id}" — ${t.description}`).join("; ");
const swarmList = presetSwarms.map((s) => `"${s.id}" — ${s.description}`).join("; ");

export const spawnTeam: SkillDefinition = {
  id: "spawn_team",
  name: "Spawn Agent Team",
  description: `Run a multi-agent team to collaboratively complete a task. Available teams: ${teamList}`,
  category: "system",
  parameters: [
    {
      name: "team_id",
      type: "string",
      description: `The preset team ID to use. One of: ${presetTeams.map((t) => t.id).join(", ")}`,
      required: true,
    },
    {
      name: "task",
      type: "string",
      description: "The task or question for the team to work on",
      required: true,
    },
    {
      name: "context",
      type: "string",
      description: "Optional additional context, background info, or code to give the team",
    },
  ],
  async execute(args, ctx) {
    const teamId = args.team_id as string;
    const task = args.task as string;
    const context = args.context as string | undefined;

    const definition = presetTeams.find((t) => t.id === teamId);
    if (!definition) {
      return {
        success: false,
        output: `Unknown team "${teamId}". Available teams: ${presetTeams.map((t) => t.id).join(", ")}`,
      };
    }

    try {
      const orchestrator = new TeamOrchestrator(definition);
      const result = await orchestrator.run({
        teamId: definition.id,
        task,
        context,
        userId: ctx.userId,
        conversationId: ctx.conversationId,
      });

      const agentSummary = result.agentResults
        .map((r) => `- **${r.agentName}** (${Math.round(r.durationMs / 1000)}s)`)
        .join("\n");

      return {
        success: true,
        output: `## ${definition.name} — Result\n\n**Strategy:** ${result.strategy} | **Duration:** ${Math.round(result.durationMs / 1000)}s\n**Agents:**\n${agentSummary}\n\n---\n\n${result.finalOutput}`,
        data: {
          teamId: result.teamId,
          strategy: result.strategy,
          durationMs: result.durationMs,
          agentCount: result.agentResults.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: `Team execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

export const spawnSwarm: SkillDefinition = {
  id: "spawn_swarm",
  name: "Spawn Agent Swarm",
  description: `Run a parallel agent swarm where multiple agents work simultaneously and results are aggregated. Available swarms: ${swarmList}`,
  category: "system",
  parameters: [
    {
      name: "swarm_id",
      type: "string",
      description: `The preset swarm ID to use. One of: ${presetSwarms.map((s) => s.id).join(", ")}`,
      required: true,
    },
    {
      name: "task",
      type: "string",
      description: "The task or question for the swarm to work on",
      required: true,
    },
    {
      name: "context",
      type: "string",
      description: "Optional additional context or background info for the swarm",
    },
  ],
  async execute(args, ctx) {
    const swarmId = args.swarm_id as string;
    const task = args.task as string;
    const context = args.context as string | undefined;

    const definition = presetSwarms.find((s) => s.id === swarmId);
    if (!definition) {
      return {
        success: false,
        output: `Unknown swarm "${swarmId}". Available swarms: ${presetSwarms.map((s) => s.id).join(", ")}`,
      };
    }

    try {
      const orchestrator = new SwarmOrchestrator(definition);
      const result = await orchestrator.run({
        swarmId: definition.id,
        task,
        context,
        userId: ctx.userId,
        conversationId: ctx.conversationId,
      });

      const agentSummary = result.agentResults
        .map((r) => {
          const status = r.error ? `error: ${r.error}` : `${Math.round(r.durationMs / 1000)}s`;
          return `- **${r.agentName}** (${status})`;
        })
        .join("\n");

      return {
        success: true,
        output: `## ${definition.name} — Result\n\n**Aggregation:** ${result.aggregation} | **Duration:** ${Math.round(result.durationMs / 1000)}s\n**Agents:**\n${agentSummary}\n\n---\n\n${result.finalOutput}`,
        data: {
          swarmId: result.swarmId,
          aggregation: result.aggregation,
          durationMs: result.durationMs,
          agentCount: result.agentResults.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        output: `Swarm execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

export const agentSkills = [spawnTeam, spawnSwarm];
