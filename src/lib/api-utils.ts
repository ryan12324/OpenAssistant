import { getLogger } from "@/lib/logger";

const log = getLogger("api");

export function handleApiError(error: unknown, context: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    log.warn(`Unauthorized request to ${context}`);
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  log.error(`Failed to ${context}`, { error });
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
