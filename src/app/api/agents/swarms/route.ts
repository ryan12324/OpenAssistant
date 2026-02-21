import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { SwarmOrchestrator, presetSwarms } from "@/lib/agents";
import type { SwarmDefinition } from "@/lib/agents";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.agents.swarms");

/** GET /api/agents/swarms — List available swarm presets */
export async function GET() {
  try {
    log.info("Listing available swarm presets");
    await requireSession();

    const swarms = presetSwarms.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      aggregation: s.aggregation,
      agents: s.agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
      })),
    }));

    log.debug("Swarm presets retrieved", { count: swarms.length });
    return Response.json({ swarms });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/agents/swarms — Run a swarm on a task */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const body = await req.json();

    const { swarmId, task, context, customSwarm, agentTasks } = body as {
      swarmId?: string;
      task: string;
      context?: string;
      customSwarm?: SwarmDefinition;
      agentTasks?: Record<string, string>;
    };

    log.info("Swarm execution requested", { swarmId, task });

    if (!task) {
      log.warn("Swarm execution rejected: missing task");
      return Response.json({ error: "Task is required" }, { status: 400 });
    }

    const definition = customSwarm || presetSwarms.find((s) => s.id === swarmId);
    if (!definition) {
      log.warn("Swarm not found", { swarmId });
      return Response.json({ error: "Swarm not found" }, { status: 404 });
    }

    const orchestrator = new SwarmOrchestrator(definition);

    const result = await orchestrator.run({
      swarmId: definition.id,
      task,
      context,
      userId: session.user.id,
      conversationId: `swarm-${definition.id}-${Date.now()}`,
      agentTasks,
    });

    const durationMs = Date.now() - startTime;
    log.info("Swarm execution completed", { swarmId: definition.id, durationMs });
    return Response.json(result);
  } catch (error) {
    log.error("Swarm execution error", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
