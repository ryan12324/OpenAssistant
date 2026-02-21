import type { McpDiscoveredTool } from "./types";

export type ToolApproval = "auto" | "confirm";

/**
 * Determine whether an MCP tool call should be auto-approved or require
 * user confirmation, based on the tool's annotations from the server.
 *
 * Policy:
 *  - readOnlyHint && !destructiveHint  → auto-approve
 *  - destructiveHint                   → always confirm
 *  - no annotations / unknown          → confirm (safe default)
 */
export function getToolApprovalRequirement(
  tool: McpDiscoveredTool
): ToolApproval {
  const a = tool.annotations;

  // No annotations → default to confirm for safety
  if (!a) return "confirm";

  // Explicitly destructive → always confirm
  if (a.destructiveHint) return "confirm";

  // Explicitly read-only → auto-approve
  if (a.readOnlyHint) return "auto";

  // Has annotations but neither flag set → confirm
  return "confirm";
}

/**
 * Build a human-readable label for the tool's permission level.
 */
export function getToolPermissionLabel(tool: McpDiscoveredTool): string {
  const a = tool.annotations;
  if (!a) return "unknown";
  if (a.destructiveHint) return "destructive";
  if (a.readOnlyHint) return "read-only";
  if (a.idempotentHint) return "idempotent";
  return "unknown";
}
