import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSession, mockRunStream, mockPresetTeams, mockLog } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockRunStream: vi.fn(),
  mockPresetTeams: [
    {
      id: "dev-team",
      name: "Dev Team",
      description: "Development tasks",
      strategy: "sequential",
      agents: [
        { id: "agent-1", name: "Coder", role: "developer" },
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
    runStream = mockRunStream;
  },
  presetTeams: mockPresetTeams,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/agents/teams/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readStream(res: Response): Promise<string[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
  }
  return chunks;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/agents/teams/stream", () => {
  it("streams events from a preset team", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    async function* mockGenerator() {
      yield { type: "agent_start", agentId: "agent-1" };
      yield { type: "agent_output", agentId: "agent-1", output: "Hello" };
      yield { type: "complete", finalOutput: "Done" };
    }
    mockRunStream.mockReturnValue(mockGenerator());

    const req = makeRequest({ teamId: "dev-team", task: "Build feature" });
    const res = await POST(req as any);

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Connection")).toBe("keep-alive");

    const chunks = await readStream(res);
    const combined = chunks.join("");

    expect(combined).toContain("agent_start");
    expect(combined).toContain("agent_output");
    expect(combined).toContain("complete");
  });

  it("streams events from a custom team", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    async function* mockGenerator() {
      yield { type: "complete" };
    }
    mockRunStream.mockReturnValue(mockGenerator());

    const customTeam = {
      id: "custom-team",
      name: "Custom",
      agents: [{ id: "a1", name: "A1", role: "worker" }],
      strategy: "roundRobin",
    };
    const req = makeRequest({ task: "Custom work", customTeam });
    const res = await POST(req as any);

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const chunks = await readStream(res);
    expect(chunks.join("")).toContain("complete");
  });

  it("handles stream errors gracefully with Error", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    async function* mockGenerator() {
      yield { type: "agent_start", agentId: "agent-1" };
      throw new Error("Stream processing failed");
    }
    mockRunStream.mockReturnValue(mockGenerator());

    const req = makeRequest({ teamId: "dev-team", task: "Build feature" });
    const res = await POST(req as any);

    const chunks = await readStream(res);
    const combined = chunks.join("");

    expect(combined).toContain("error");
    expect(combined).toContain("Stream processing failed");
  });

  it("handles non-Error stream errors", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    async function* mockGenerator(): AsyncGenerator<unknown> {
      throw "string error";
    }
    mockRunStream.mockReturnValue(mockGenerator());

    const req = makeRequest({ teamId: "dev-team", task: "Build feature" });
    const res = await POST(req as any);

    // The stream should contain an error event with "Unknown error"
    const chunks = await readStream(res);
    const combined = chunks.join("");

    expect(combined).toContain("Unknown error");
  });

  it("returns 400 when task is missing", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({ teamId: "dev-team" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Task is required" });
  });

  it("returns 404 when team not found", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({ teamId: "nonexistent", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Team not found" });
  });

  it("returns 401 when unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makeRequest({ teamId: "dev-team", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 on generic error", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB failed"));

    const req = makeRequest({ teamId: "dev-team", task: "do something" });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("passes context to runStream", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    async function* mockGenerator() {
      yield { type: "complete" };
    }
    mockRunStream.mockReturnValue(mockGenerator());

    const req = makeRequest({
      teamId: "dev-team",
      task: "Task",
      context: "extra context",
    });
    const res = await POST(req as any);
    await readStream(res);

    expect(mockRunStream).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "extra context",
        streamIntermediate: true,
      })
    );
  });
});
