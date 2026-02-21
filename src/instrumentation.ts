/**
 * Next.js Instrumentation — runs once on server startup.
 *
 * Starts the background job worker (Gateway Pattern poller) so
 * enqueued inbound messages are processed asynchronously.
 */
export function register() {
  // Only run on the server (not during build or in the edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    initWorker().catch((err) => {
      console.error("Failed to initialize worker:", err);
    });
  }
}

async function initWorker() {
  const { getLogger } = await import("@/lib/logger");
  const log = getLogger("instrumentation");
  log.info("Server starting — initializing background worker", { runtime: process.env.NEXT_RUNTIME });
  const { initWorker: startWorker } = await import("@/lib/worker");
  startWorker();
  log.info("Instrumentation complete — worker initialized");
}
