import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockTeamRun, mockPresetTeams, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockTeamRun: vi.fn(),
  mockPresetTeams: [
    {
      id: "dev-team",
      name: "Dev Team",
      description: "Development tasks",
      strategy: "sequential",
      agents: [
        { id: "agent-1", name: "Coder", role: "developer" },
        { id: "agent-2", name: "Reviewer", role: "reviewer" },
      ],
      maxRounds: 3,
    },
  ],
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/agents", () => ({
  TeamOrchestrator: class MockTeamOrchestrator {
    constructor(public definition: unknown) {}
    run = mockTeamRun;
  },
  presetTeams: mockPresetTeams,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { GET, POST } from "../route";

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/agents/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ========================== GET ===========================================

describe("GET /api/agents/teams", () => {
  it("returns list of team presets", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.teams).toHaveLength(1);
    expect(json.teams[0].id).toBe("dev-team");
    expect(json.teams[0].strategy).toBe("sequential");
    expect(json.teams[0].agents).toHaveLength(2);
    expect(json.teams[0].maxRounds).toBe(3);
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});

// ========================== POST ==========================================

describe("POST /api/agents/teams", () => {
  it("runs a preset team on a task", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const runResult = { finalOutput: "Code review complete", rounds: 2 };
    mockTeamRun.mockResolvedValue(runResult);

    const req = makePostRequest({
      teamId: "dev-team",
      task: "Review this code",
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(runResult);
  });

  it("runs a custom team on a task", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockTeamRun.mockResolvedValue({ finalOutput: "done" });

    const customTeam = {
      id: "custom-team",
      name: "Custom",
      agents: [{ id: "a1", name: "A1", role: "worker" }],
      strategy: "roundRobin",
    };
    const req = makePostRequest({
      task: "Custom work",
      customTeam,
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
  });

  it("passes context to the run", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockTeamRun.mockResolvedValue({ finalOutput: "done" });

    const req = makePostRequest({
      teamId: "dev-team",
      task: "Task",
      context: "extra context",
    });
    await POST(req as any);

    expect(mockTeamRun).toHaveBeenCalledWith(
      expect.objectContaining({ context: "extra context" })
    );
  });

  it("returns 400 when task is missing", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makePostRequest({ teamId: "dev-team" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Task is required" });
  });

  it("returns 404 when team not found", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makePostRequest({ teamId: "nonexistent", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Team not found" });
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makePostRequest({ teamId: "dev-team", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const req = makePostRequest({ teamId: "dev-team", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 on non-Error throw", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockTeamRun.mockRejectedValue("string error");

    const req = makePostRequest({ teamId: "dev-team", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});
