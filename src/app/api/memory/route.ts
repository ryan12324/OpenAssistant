import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { memoryManager } from "@/lib/rag/memory";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const searchParams = req.nextUrl.searchParams;

    const type = searchParams.get("type") as "short_term" | "long_term" | "episodic" | null;
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const result = await memoryManager.list({
      userId: session.user.id,
      type: type || undefined,
      limit,
      offset,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    const id = await memoryManager.store({
      userId: session.user.id,
      content: body.content,
      type: body.type || "long_term",
      tags: body.tags,
      summary: body.summary,
    });

    return Response.json({ id, status: "ok" });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const { memoryId } = await req.json();

    await memoryManager.delete(memoryId, session.user.id);
    return Response.json({ status: "ok" });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
