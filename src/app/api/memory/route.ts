import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { memoryManager } from "@/lib/rag/memory";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.memory");

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const searchParams = req.nextUrl.searchParams;

    const type = searchParams.get("type") as "short_term" | "long_term" | "episodic" | null;
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    log.info("Listing memories", { type, limit, offset });

    const result = await memoryManager.list({
      userId: session.user.id,
      type: type || undefined,
      limit,
      offset,
    });

    log.debug("Memories listed successfully", { count: result.memories?.length, total: result.total });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      log.warn("Unauthorized request to list memories");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    log.error("Failed to list memories", { error });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    log.info("Storing memory", {
      type: body.type || "long_term",
      contentLength: body.content?.length,
      tags: body.tags,
    });

    const id = await memoryManager.store({
      userId: session.user.id,
      content: body.content,
      type: body.type || "long_term",
      tags: body.tags,
      summary: body.summary,
    });

    log.info("Memory stored successfully", { memoryId: id });
    return Response.json({ id, status: "ok" });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      log.warn("Unauthorized request to store memory");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    log.error("Failed to store memory", { error });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const { memoryId } = await req.json();

    log.info("Deleting memory", { memoryId });

    await memoryManager.delete(memoryId, session.user.id);

    log.info("Memory deleted successfully", { memoryId });
    return Response.json({ status: "ok" });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      log.warn("Unauthorized request to delete memory");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    log.error("Failed to delete memory", { error });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
