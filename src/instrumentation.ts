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
  // webpackIgnore prevents webpack from bundling these server-only modules
  // into the Edge runtime build where Node.js builtins are unavailable.
  const { getLogger } = await import(/* webpackIgnore: true */ "@/lib/logger");
  const log = getLogger("instrumentation");
  log.info("Server starting — initializing background worker", { runtime: process.env.NEXT_RUNTIME });
  const { initWorker: startWorker } = await import(/* webpackIgnore: true */ "@/lib/worker");
  startWorker();
  log.info("Instrumentation complete — worker initialized");
}
