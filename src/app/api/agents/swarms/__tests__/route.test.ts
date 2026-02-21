import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockSwarmRun, mockPresetSwarms, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockSwarmRun: vi.fn(),
  mockPresetSwarms: [
    {
      id: "research-swarm",
      name: "Research Swarm",
      description: "Research tasks",
      aggregation: "merge",
      agents: [
        { id: "agent-1", name: "Agent 1", role: "researcher" },
        { id: "agent-2", name: "Agent 2", role: "analyst" },
      ],
    },
  ],
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/agents", () => ({
  SwarmOrchestrator: class MockSwarmOrchestrator {
    constructor(public definition: unknown) {}
    run = mockSwarmRun;
  },
  presetSwarms: mockPresetSwarms,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { GET, POST } from "../route";

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/agents/swarms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ========================== GET ===========================================

describe("GET /api/agents/swarms", () => {
  it("returns list of swarm presets", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.swarms).toHaveLength(1);
    expect(json.swarms[0].id).toBe("research-swarm");
    expect(json.swarms[0].agents).toHaveLength(2);
    expect(json.swarms[0].agents[0].role).toBe("researcher");
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

describe("POST /api/agents/swarms", () => {
  it("runs a preset swarm on a task", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const runResult = { finalOutput: "Research complete", agentOutputs: {} };
    mockSwarmRun.mockResolvedValue(runResult);

    const req = makePostRequest({
      swarmId: "research-swarm",
      task: "Research AI trends",
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(runResult);
  });

  it("runs a custom swarm on a task", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockSwarmRun.mockResolvedValue({ finalOutput: "done" });

    const customSwarm = {
      id: "custom-1",
      name: "Custom",
      agents: [{ id: "a1", name: "A1", role: "worker" }],
      aggregation: "merge",
    };
    const req = makePostRequest({
      task: "Custom task",
      customSwarm,
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
  });

  it("passes context and agentTasks to run", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockSwarmRun.mockResolvedValue({ finalOutput: "done" });

    const req = makePostRequest({
      swarmId: "research-swarm",
      task: "Research",
      context: "additional context",
      agentTasks: { "agent-1": "specific task" },
    });
    await POST(req as any);

    expect(mockSwarmRun).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "additional context",
        agentTasks: { "agent-1": "specific task" },
      })
    );
  });

  it("returns 400 when task is missing", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makePostRequest({ swarmId: "research-swarm" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Task is required" });
  });

  it("returns 404 when swarm not found", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makePostRequest({ swarmId: "nonexistent", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Swarm not found" });
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makePostRequest({ swarmId: "research-swarm", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const req = makePostRequest({ swarmId: "research-swarm", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 on non-Error throw", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockSwarmRun.mockRejectedValue("string error");

    const req = makePostRequest({ swarmId: "research-swarm", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });
});
