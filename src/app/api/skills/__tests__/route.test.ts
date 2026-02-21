import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockSkillRegistry, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockSkillRegistry: {
    getAll: vi.fn(),
  },
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/skills/registry", () => ({
  skillRegistry: mockSkillRegistry,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/skills", () => {
  it("returns skills list on success", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockSkillRegistry.getAll.mockReturnValue([
      {
        id: "skill-1",
        name: "Web Search",
        description: "Search the web",
        category: "research",
        parameters: [{ name: "query", type: "string" }],
        extraField: "should be excluded",
      },
      {
        id: "skill-2",
        name: "Code Gen",
        description: "Generate code",
        category: "development",
        parameters: [],
      },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.skills).toHaveLength(2);
    expect(json.skills[0]).toEqual({
      id: "skill-1",
      name: "Web Search",
      description: "Search the web",
      category: "research",
      parameters: [{ name: "query", type: "string" }],
    });
    expect(json.skills[1]).toEqual({
      id: "skill-2",
      name: "Code Gen",
      description: "Generate code",
      category: "development",
      parameters: [],
    });
    // Ensure extraField is not included
    expect(json.skills[0].extraField).toBeUndefined();
    expect(mockLog.info).toHaveBeenCalledWith("Listing available skills");
    expect(mockLog.debug).toHaveBeenCalledWith("Skills retrieved", { count: 2 });
  });

  it("returns empty skills array when none registered", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockSkillRegistry.getAll.mockReturnValue([]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.skills).toEqual([]);
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic Error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB connection failed"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 on non-Error thrown value", async () => {
    mockRequireSession.mockRejectedValue("string error");

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});
