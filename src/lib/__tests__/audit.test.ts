// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockCreate,
  mockFindMany,
  mockDebug,
  mockInfo,
  mockError,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
  mockDebug: vi.fn(),
  mockInfo: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ debug: mockDebug, info: mockInfo, error: mockError }),
}));

// ---------------------------------------------------------------------------
// Import SUT (after mocks are set up)
// ---------------------------------------------------------------------------

import { audit, getAuditLogs } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// truncate (internal function, tested indirectly through audit)
// ---------------------------------------------------------------------------

describe("truncate (via audit)", () => {
  it("converts null input/output to null", () => {
    mockCreate.mockReturnValue({ catch: vi.fn() });

    audit({ userId: "u1", action: "tool_call", input: null, output: null });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ input: null, output: null }),
      }),
    );
  });

  it("converts undefined input/output to null", () => {
    mockCreate.mockReturnValue({ catch: vi.fn() });

    audit({ userId: "u1", action: "tool_call" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ input: null, output: null }),
      }),
    );
  });

  it("keeps short strings unchanged", () => {
    mockCreate.mockReturnValue({ catch: vi.fn() });

    audit({ userId: "u1", action: "tool_call", input: "short", output: "also short" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ input: "short", output: "also short" }),
      }),
    );
  });

  it("truncates strings longer than 2000 characters with ellipsis", () => {
    mockCreate.mockReturnValue({ catch: vi.fn() });

    const longString = "x".repeat(2500);
    audit({ userId: "u1", action: "tool_call", input: longString, output: longString });

    const expectedTruncated = "x".repeat(2000) + "\u2026";
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          input: expectedTruncated,
          output: expectedTruncated,
        }),
      }),
    );
  });

  it("JSON-stringifies objects before truncating", () => {
    mockCreate.mockReturnValue({ catch: vi.fn() });

    const obj = { key: "value" };
    audit({ userId: "u1", action: "tool_call", input: obj });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ input: JSON.stringify(obj) }),
      }),
    );
  });

  it("JSON-stringifies and truncates large objects", () => {
    mockCreate.mockReturnValue({ catch: vi.fn() });

    const obj = { data: "y".repeat(3000) };
    audit({ userId: "u1", action: "tool_call", input: obj });

    const json = JSON.stringify(obj);
    const expectedTruncated = json.slice(0, 2000) + "\u2026";
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ input: expectedTruncated }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// audit
// ---------------------------------------------------------------------------

describe("audit", () => {
  it("calls prisma.auditLog.create with correct data for all fields", () => {
    mockCreate.mockReturnValue({ catch: vi.fn() });

    audit({
      userId: "u1",
      action: "skill_execute",
      skillId: "skill-abc",
      input: "test input",
      output: "test output",
      source: "api",
      durationMs: 123,
      success: false,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        action: "skill_execute",
        skillId: "skill-abc",
        input: "test input",
        output: "test output",
        source: "api",
        durationMs: 123,
        success: false,
      },
    });
  });

  it("defaults optional fields: skillId, source, durationMs to null and success to true", () => {
    mockCreate.mockReturnValue({ catch: vi.fn() });

    audit({ userId: "u2", action: "memory_store" });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: "u2",
        action: "memory_store",
        skillId: null,
        input: null,
        output: null,
        source: null,
        durationMs: null,
        success: true,
      },
    });
  });

  it("calls log.debug with entry metadata", () => {
    mockCreate.mockReturnValue({ catch: vi.fn() });

    audit({
      userId: "u3",
      action: "agent_spawn",
      skillId: "s1",
      source: "web",
      durationMs: 50,
      success: true,
    });

    expect(mockDebug).toHaveBeenCalledWith("Writing audit entry", {
      action: "agent_spawn",
      userId: "u3",
      skillId: "s1",
      source: "web",
      durationMs: 50,
      success: true,
    });
  });

  it("catch handler logs error message when Error instance is thrown", async () => {
    let catchHandler: (err: unknown) => void;
    mockCreate.mockReturnValue({
      catch: (fn: (err: unknown) => void) => {
        catchHandler = fn;
      },
    });

    audit({ userId: "u4", action: "tool_call" });

    // Simulate the promise rejection
    catchHandler!(new Error("DB connection failed"));

    expect(mockError).toHaveBeenCalledWith("Failed to write audit log", {
      error: "DB connection failed",
    });
  });

  it("catch handler logs stringified error for non-Error values", async () => {
    let catchHandler: (err: unknown) => void;
    mockCreate.mockReturnValue({
      catch: (fn: (err: unknown) => void) => {
        catchHandler = fn;
      },
    });

    audit({ userId: "u5", action: "mcp_tool_call" });

    // Simulate rejection with a non-Error value
    catchHandler!("raw string error");

    expect(mockError).toHaveBeenCalledWith("Failed to write audit log", {
      error: "raw string error",
    });
  });
});

// ---------------------------------------------------------------------------
// getAuditLogs
// ---------------------------------------------------------------------------

describe("getAuditLogs", () => {
  it("queries with action filter when provided", async () => {
    const mockResults = [{ id: "1", action: "tool_call" }];
    mockFindMany.mockResolvedValue(mockResults);

    const results = await getAuditLogs({
      userId: "u1",
      action: "tool_call",
    });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "u1", action: "tool_call" },
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: 0,
    });
    expect(results).toEqual(mockResults);
  });

  it("queries without action filter when not provided", async () => {
    const mockResults = [{ id: "2" }, { id: "3" }];
    mockFindMany.mockResolvedValue(mockResults);

    const results = await getAuditLogs({ userId: "u2" });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "u2" },
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: 0,
    });
    expect(results).toEqual(mockResults);
  });

  it("uses default limit=50 and offset=0", async () => {
    mockFindMany.mockResolvedValue([]);

    await getAuditLogs({ userId: "u3" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, skip: 0 }),
    );
  });

  it("uses custom limit and offset when provided", async () => {
    mockFindMany.mockResolvedValue([]);

    await getAuditLogs({ userId: "u4", limit: 10, offset: 20 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 20 }),
    );
  });

  it("logs debug messages for query start and completion", async () => {
    mockFindMany.mockResolvedValue([{ id: "x" }]);

    await getAuditLogs({ userId: "u5", action: "memory_recall", limit: 25 });

    expect(mockDebug).toHaveBeenCalledWith("Querying audit logs", {
      userId: "u5",
      action: "memory_recall",
      limit: 25,
    });
    expect(mockDebug).toHaveBeenCalledWith("Audit logs query complete", { count: 1 });
  });
});
