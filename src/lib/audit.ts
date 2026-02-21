import { prisma } from "@/lib/prisma";

/**
 * Harness & Permissions — Audit logging for every tool/skill execution.
 *
 * Records who ran what, from where, with what inputs, and whether it
 * succeeded. Truncates large payloads to keep the DB manageable.
 */

const MAX_INPUT_LEN = 2_000;
const MAX_OUTPUT_LEN = 2_000;

export type AuditAction =
  | "tool_call"
  | "skill_execute"
  | "memory_store"
  | "memory_recall"
  | "inbound_message"
  | "outbound_reply"
  | "agent_spawn";

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  skillId?: string;
  input?: unknown;
  output?: unknown;
  source?: string;
  durationMs?: number;
  success?: boolean;
}

function truncate(val: unknown, max: number): string | null {
  if (val === undefined || val === null) return null;
  const s = typeof val === "string" ? val : JSON.stringify(val);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Write an audit log entry (non-blocking, best-effort). */
export function audit(entry: AuditEntry): void {
  prisma.auditLog
    .create({
      data: {
        userId: entry.userId,
        action: entry.action,
        skillId: entry.skillId ?? null,
        input: truncate(entry.input, MAX_INPUT_LEN),
        output: truncate(entry.output, MAX_OUTPUT_LEN),
        source: entry.source ?? null,
        durationMs: entry.durationMs ?? null,
        success: entry.success ?? true,
      },
    })
    .catch((err) => {
      console.error("[audit] Failed to write log:", err);
    });
}

/** Query recent audit log entries for a user. */
export async function getAuditLogs(params: {
  userId: string;
  action?: AuditAction;
  limit?: number;
  offset?: number;
}) {
  return prisma.auditLog.findMany({
    where: {
      userId: params.userId,
      ...(params.action ? { action: params.action } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 50,
    skip: params.offset ?? 0,
  });
}
