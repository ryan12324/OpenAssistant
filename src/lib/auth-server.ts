import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getLogger } from "@/lib/logger";

const log = getLogger("auth");

/**
 * Get the current session on the server side.
 * Returns null if not authenticated.
 */
export async function getSession() {
  log.debug("Resolving session from request headers");
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session) {
    log.debug("Session resolved", { userId: session.user.id });
  } else {
    log.debug("No active session found");
  }
  return session;
}

/**
 * Require authentication. Throws if not authenticated.
 */
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    log.warn("requireSession — unauthorized request rejected");
    throw new Error("Unauthorized");
  }
  log.debug("requireSession — authorized", { userId: session.user.id });
  return session;
}
