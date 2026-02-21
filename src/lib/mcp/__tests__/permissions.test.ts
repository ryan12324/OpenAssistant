import { describe, it, expect } from "vitest";
import {
  getToolApprovalRequirement,
  getToolPermissionLabel,
} from "../permissions";
import type { McpDiscoveredTool } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTool(
  annotations?: McpDiscoveredTool["annotations"]
): McpDiscoveredTool {
  return {
    serverId: "test-server",
    serverName: "Test Server",
    name: "test-tool",
    description: "A test tool",
    inputSchema: {},
    annotations,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("permissions", () => {
  // ── getToolApprovalRequirement ──────────────────────────────────────

  describe("getToolApprovalRequirement()", () => {
    it("returns 'confirm' when no annotations", () => {
      const tool = makeTool(undefined);
      expect(getToolApprovalRequirement(tool)).toBe("confirm");
    });

    it("returns 'confirm' when destructiveHint is true", () => {
      const tool = makeTool({ destructiveHint: true });
      expect(getToolApprovalRequirement(tool)).toBe("confirm");
    });

    it("returns 'confirm' when both destructiveHint and readOnlyHint are true", () => {
      // destructive takes priority
      const tool = makeTool({ destructiveHint: true, readOnlyHint: true });
      expect(getToolApprovalRequirement(tool)).toBe("confirm");
    });

    it("returns 'auto' when readOnlyHint is true and not destructive", () => {
      const tool = makeTool({ readOnlyHint: true });
      expect(getToolApprovalRequirement(tool)).toBe("auto");
    });

    it("returns 'auto' when readOnlyHint is true and destructiveHint is false", () => {
      const tool = makeTool({ readOnlyHint: true, destructiveHint: false });
      expect(getToolApprovalRequirement(tool)).toBe("auto");
    });

    it("returns 'confirm' when annotations exist but neither flag set", () => {
      const tool = makeTool({ idempotentHint: true });
      expect(getToolApprovalRequirement(tool)).toBe("confirm");
    });

    it("returns 'confirm' when annotations is empty object", () => {
      const tool = makeTool({});
      expect(getToolApprovalRequirement(tool)).toBe("confirm");
    });
  });

  // ── getToolPermissionLabel ──────────────────────────────────────────

  describe("getToolPermissionLabel()", () => {
    it("returns 'unknown' when no annotations", () => {
      const tool = makeTool(undefined);
      expect(getToolPermissionLabel(tool)).toBe("unknown");
    });

    it("returns 'destructive' when destructiveHint is true", () => {
      const tool = makeTool({ destructiveHint: true });
      expect(getToolPermissionLabel(tool)).toBe("destructive");
    });

    it("returns 'read-only' when readOnlyHint is true", () => {
      const tool = makeTool({ readOnlyHint: true });
      expect(getToolPermissionLabel(tool)).toBe("read-only");
    });

    it("returns 'destructive' when both destructive and readOnly (destructive takes priority)", () => {
      const tool = makeTool({ destructiveHint: true, readOnlyHint: true });
      expect(getToolPermissionLabel(tool)).toBe("destructive");
    });

    it("returns 'idempotent' when only idempotentHint is true", () => {
      const tool = makeTool({ idempotentHint: true });
      expect(getToolPermissionLabel(tool)).toBe("idempotent");
    });

    it("returns 'unknown' when annotations has only openWorldHint", () => {
      const tool = makeTool({ openWorldHint: true });
      expect(getToolPermissionLabel(tool)).toBe("unknown");
    });

    it("returns 'unknown' when annotations is empty object", () => {
      const tool = makeTool({});
      expect(getToolPermissionLabel(tool)).toBe("unknown");
    });
  });
});
