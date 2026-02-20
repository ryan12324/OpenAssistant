"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface AgentInfo {
  id: string;
  name: string;
  role: string;
}

interface TeamPreset {
  id: string;
  name: string;
  description: string;
  strategy: string;
  agents: AgentInfo[];
  maxRounds?: number;
}

interface SwarmPreset {
  id: string;
  name: string;
  description: string;
  aggregation: string;
  agents: AgentInfo[];
}

interface AgentResult {
  agentId: string;
  agentName: string;
  output: string;
  durationMs: number;
  error?: string;
}

interface RunResult {
  finalOutput: string;
  durationMs: number;
  agentResults: AgentResult[];
  strategy?: string;
  aggregation?: string;
}

type AgentEvent = {
  type: string;
  agentId?: string;
  agentName?: string;
  chunk?: string;
  output?: string;
  durationMs?: number;
  error?: string;
  finalOutput?: string;
  round?: number;
  maxRounds?: number;
  from?: string;
  to?: string;
  reason?: string;
};

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamPreset[]>([]);
  const [swarms, setSwarms] = useState<SwarmPreset[]>([]);
  const [tab, setTab] = useState<"teams" | "swarms">("teams");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([]);
  const [liveOutput, setLiveOutput] = useState<Record<string, string>>({});
  const [useStreaming, setUseStreaming] = useState(true);

  useEffect(() => {
    fetch("/api/agents/teams")
      .then((r) => r.json())
      .then((d) => setTeams(d.teams || []))
      .catch(() => {});
    fetch("/api/agents/swarms")
      .then((r) => r.json())
      .then((d) => setSwarms(d.swarms || []))
      .catch(() => {});
  }, []);

  const items = tab === "teams" ? teams : swarms;
  const selected =
    tab === "teams"
      ? teams.find((t) => t.id === selectedId)
      : swarms.find((s) => s.id === selectedId);

  async function handleRun() {
    if (!selectedId || !task.trim()) return;
    setRunning(true);
    setResult(null);
    setLiveEvents([]);
    setLiveOutput({});

    const endpoint = tab === "teams" ? "/api/agents/teams" : "/api/agents/swarms";
    const idKey = tab === "teams" ? "teamId" : "swarmId";

    if (useStreaming && tab === "teams") {
      // SSE streaming for teams
      try {
        const res = await fetch("/api/agents/teams/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: selectedId, task: task.trim() }),
        });

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const event = JSON.parse(line.slice(6)) as AgentEvent;
                  setLiveEvents((prev) => [...prev, event]);

                  if (event.type === "agent_chunk" && event.agentId) {
                    setLiveOutput((prev) => ({
                      ...prev,
                      [event.agentId!]: (prev[event.agentId!] || "") + (event.chunk || ""),
                    }));
                  }

                  if (event.type === "complete" && event.finalOutput) {
                    setResult({
                      finalOutput: event.finalOutput,
                      durationMs: event.durationMs || 0,
                      agentResults: [],
                      strategy: (selected as TeamPreset)?.strategy,
                    });
                  }
                } catch {
                  // Skip malformed events
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Stream error:", error);
      }
    } else {
      // Non-streaming
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [idKey]: selectedId, task: task.trim() }),
        });
        const data = await res.json();
        setResult(data);
      } catch {
        // Handle error
      }
    }

    setRunning(false);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Agent Teams & Swarms</h1>
        <p className="text-sm text-muted-foreground">
          Orchestrate multiple AI agents to collaborate on complex tasks
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Tab Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setTab("teams"); setSelectedId(null); setResult(null); }}
              className={cn("rounded-md px-4 py-2 text-sm font-medium", tab === "teams" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
            >
              Teams ({teams.length})
            </button>
            <button
              onClick={() => { setTab("swarms"); setSelectedId(null); setResult(null); }}
              className={cn("rounded-md px-4 py-2 text-sm font-medium", tab === "swarms" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
            >
              Swarms ({swarms.length})
            </button>
          </div>

          {/* Preset Selection */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => { setSelectedId(item.id); setResult(null); setLiveEvents([]); setLiveOutput({}); }}
                className={cn(
                  "rounded-lg border bg-card p-4 text-left transition-colors",
                  selectedId === item.id ? "border-primary" : "border-border hover:border-muted-foreground"
                )}
              >
                <h3 className="font-medium">{item.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {"strategy" in item && (
                    <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                      {(item as TeamPreset).strategy}
                    </span>
                  )}
                  {"aggregation" in item && (
                    <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                      {(item as SwarmPreset).aggregation}
                    </span>
                  )}
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {item.agents.length} agents
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Selected Team/Swarm Details */}
          {selected && (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold">{selected.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>

              {/* Agent roster */}
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium">Agents</h3>
                <div className="space-y-2">
                  {selected.agents.map((agent) => (
                    <div key={agent.id} className="flex items-center gap-3 rounded-md bg-muted p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/20 text-xs font-bold text-primary">
                        {agent.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Task input */}
              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium">Task</label>
                <textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Describe the task for the team to work on..."
                  rows={3}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
                />
                <div className="mt-3 flex items-center justify-between">
                  {tab === "teams" && (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={useStreaming}
                        onChange={(e) => setUseStreaming(e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      Stream live
                    </label>
                  )}
                  <button
                    onClick={handleRun}
                    disabled={running || !task.trim()}
                    className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {running ? "Running..." : `Run ${tab === "teams" ? "Team" : "Swarm"}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Live Streaming Events */}
          {liveEvents.length > 0 && !result && (
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="mb-3 text-sm font-semibold">Live Execution</h3>
              <div className="space-y-2">
                {liveEvents.filter((e) => e.type !== "agent_chunk").map((event, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 font-mono",
                      event.type === "agent_start" && "bg-blue-500/10 text-blue-400",
                      event.type === "agent_done" && "bg-green-500/10 text-green-400",
                      event.type === "agent_error" && "bg-red-500/10 text-red-400",
                      event.type === "handoff" && "bg-yellow-500/10 text-yellow-400",
                      event.type === "round_start" && "bg-purple-500/10 text-purple-400",
                    )}>
                      {event.type}
                    </span>
                    <span className="text-muted-foreground">
                      {event.agentName && `${event.agentName} `}
                      {event.type === "agent_done" && `(${event.durationMs}ms)`}
                      {event.type === "handoff" && `${event.from} → ${event.to}: ${event.reason}`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Live agent outputs */}
              {Object.entries(liveOutput).length > 0 && (
                <div className="mt-4 space-y-3">
                  {Object.entries(liveOutput).map(([agentId, output]) => {
                    const agent = selected?.agents.find((a) => a.id === agentId);
                    return (
                      <div key={agentId} className="rounded-md bg-muted p-3">
                        <p className="mb-1 text-xs font-medium">{agent?.name || agentId}</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {output.slice(0, 500)}{output.length > 500 ? "..." : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* Final Output */}
              <div className="rounded-lg border border-primary/50 bg-card p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Final Output</h3>
                  <span className="text-xs text-muted-foreground">
                    {(result.durationMs / 1000).toFixed(1)}s total
                  </span>
                </div>
                <div className="prose-chat text-sm">
                  <ReactMarkdown>{result.finalOutput}</ReactMarkdown>
                </div>
              </div>

              {/* Per-Agent Results */}
              {result.agentResults && result.agentResults.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-6">
                  <h3 className="mb-3 text-sm font-semibold">Agent Outputs</h3>
                  <div className="space-y-4">
                    {result.agentResults.map((ar, i) => (
                      <div key={i} className="rounded-md bg-muted p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium">{ar.agentName}</span>
                          <span className="text-xs text-muted-foreground">
                            {ar.error ? (
                              <span className="text-red-400">{ar.error}</span>
                            ) : (
                              `${(ar.durationMs / 1000).toFixed(1)}s`
                            )}
                          </span>
                        </div>
                        <div className="prose-chat text-xs text-muted-foreground">
                          <ReactMarkdown>{ar.output.slice(0, 1000)}</ReactMarkdown>
                          {ar.output.length > 1000 && (
                            <p className="mt-1 italic">...truncated</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
