/**
 * Centralized structured logger.
 *
 * Produces JSON log lines with timestamps, levels, module names, and
 * arbitrary context fields. Use `log.child({ ... })` to create scoped
 * loggers that automatically attach request-specific metadata.
 *
 * Log level is controlled by the `LOG_LEVEL` env var (default: "debug").
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "debug";

interface LogContext {
  [key: string]: unknown;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatLine(
  level: LogLevel,
  module: string,
  msg: string,
  ctx: LogContext
): string {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    module,
    msg,
    ...ctx,
  };
  return JSON.stringify(entry);
}

function mask(val: unknown): string {
  if (typeof val !== "string" || val.length === 0) return "";
  if (val.length <= 8) return "***";
  return `${"*".repeat(val.length - 4)}${val.slice(-4)}`;
}

export interface Logger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  child(extra: LogContext): Logger;
}

function createLogger(module: string, baseCtx: LogContext = {}): Logger {
  function emit(level: LogLevel, msg: string, ctx?: LogContext) {
    if (!shouldLog(level)) return;
    const merged = { ...baseCtx, ...ctx };
    const line = formatLine(level, module, msg, merged);
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (msg, ctx) => emit("debug", msg, ctx),
    info: (msg, ctx) => emit("info", msg, ctx),
    warn: (msg, ctx) => emit("warn", msg, ctx),
    error: (msg, ctx) => emit("error", msg, ctx),
    child: (extra) => createLogger(module, { ...baseCtx, ...extra }),
  };
}

/** Create a logger scoped to a module name. */
export function getLogger(module: string): Logger {
  return createLogger(module);
}

/** Utility: mask an API key for safe logging. */
export { mask as maskSecret };
