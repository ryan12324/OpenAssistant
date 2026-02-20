import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { AgentRouter, presetRouters } from "@/lib/agents";

/** POST /api/agents/router — Route a message to the best agent */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    const { routerId, message, context } = body as {
      routerId?: string;
      message: string;
      context?: string;
    };

    if (!message) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const definition = presetRouters.find(
      (r) => r.id === (routerId || "general-router")
    );
    if (!definition) {
      return Response.json({ error: "Router not found" }, { status: 404 });
    }

    const router = new AgentRouter(definition);

    const result = await router.route({
      message,
      context,
      userId: session.user.id,
      conversationId: `router-${Date.now()}`,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
