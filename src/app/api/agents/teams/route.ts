import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { TeamOrchestrator, presetTeams } from "@/lib/agents";
import type { TeamDefinition } from "@/lib/agents";

/** GET /api/agents/teams — List available team presets */
export async function GET() {
  try {
    await requireSession();

    const teams = presetTeams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      strategy: t.strategy,
      agents: t.agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
      })),
      maxRounds: t.maxRounds,
    }));

    return Response.json({ teams });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/agents/teams — Run a team on a task */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    const { teamId, task, context, customTeam } = body as {
      teamId?: string;
      task: string;
      context?: string;
      customTeam?: TeamDefinition;
    };

    if (!task) {
      return Response.json({ error: "Task is required" }, { status: 400 });
    }

    // Use preset or custom team
    const definition = customTeam || presetTeams.find((t) => t.id === teamId);
    if (!definition) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const orchestrator = new TeamOrchestrator(definition);

    const result = await orchestrator.run({
      teamId: definition.id,
      task,
      context,
      userId: session.user.id,
      conversationId: `team-${definition.id}-${Date.now()}`,
    });

    return Response.json(result);
  } catch (error) {
    console.error("Team execution error:", error);
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
