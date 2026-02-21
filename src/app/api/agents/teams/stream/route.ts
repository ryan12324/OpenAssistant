import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { TeamOrchestrator, presetTeams } from "@/lib/agents";
import type { TeamDefinition } from "@/lib/agents";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.agents.teams.stream");

/** POST /api/agents/teams/stream — Run a team with SSE streaming */
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

    log.info("Starting team stream", {
      teamId: teamId || "custom",
      taskLength: task?.length ?? 0,
    });

    if (!task) {
      log.warn("Missing required task field");
      return Response.json({ error: "Task is required" }, { status: 400 });
    }

    const definition = customTeam || presetTeams.find((t) => t.id === teamId);
    if (!definition) {
      log.warn("Team not found", { teamId });
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    const orchestrator = new TeamOrchestrator(definition);

    log.info("Starting SSE stream", { teamId: definition.id });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const event of orchestrator.runStream({
            teamId: definition.id,
            task,
            context,
            userId: session.user.id,
            conversationId: `team-${definition.id}-${Date.now()}`,
            streamIntermediate: true,
          })) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          }
        } catch (error) {
          log.error("Stream error", {
            teamId: definition.id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: error instanceof Error ? error.message : "Unknown error",
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
