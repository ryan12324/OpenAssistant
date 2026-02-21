"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface McpTool {
  name: string;
  description?: string;
  permission: string;
}

interface McpServer {
  id: string;
  name: string;
  transport: string;
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
  scope: "user" | "global";
  status: string;
  error?: string | null;
  tools: McpTool[];
  connectedAt?: string | null;
}

export default function McpServersPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Add form state
  const [formName, setFormName] = useState("");
  const [formTransport, setFormTransport] = useState<"stdio" | "http">("stdio");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEnv, setFormEnv] = useState("");

  const loadServers = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp");
      const data = await res.json();
      setServers(data.servers ?? []);
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  async function handleAdd() {
    setSaving(true);
    try {
      // Parse env vars from "KEY=VALUE" lines
      const env: Record<string, string> = {};
      if (formEnv.trim()) {
        for (const line of formEnv.split("\n")) {
          const eqIdx = line.indexOf("=");
          if (eqIdx > 0) {
            env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
          }
        }
      }

      const body: Record<string, unknown> = {
        name: formName,
        transport: formTransport,
      };

      if (formTransport === "stdio") {
        body.command = formCommand;
        body.args = formArgs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (Object.keys(env).length > 0) body.env = env;
      } else {
        body.url = formUrl;
      }

      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (res.ok) {
        setStatusMsg({
          message: `Connected "${formName}" — ${data.tools?.length ?? 0} tools discovered`,
          type: "success",
        });
        setAdding(false);
        setFormName("");
        setFormCommand("");
        setFormArgs("");
        setFormUrl("");
        setFormEnv("");
        loadServers();
      } else {
        setStatusMsg({
          message: data.error || "Failed to add server",
          type: "error",
        });
      }
    } catch {
      setStatusMsg({ message: "Failed to add server", type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch("/api/mcp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      loadServers();
    } catch {
      // Handle error
    }
  }

  const userServers = servers.filter((s) => s.scope === "user");
  const globalServers = servers.filter((s) => s.scope === "global");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">MCP Servers</h1>
        <p className="text-sm text-muted-foreground">
          Connect external MCP servers to add tools to your assistant
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Status message */}
          {statusMsg && (
            <div
              className={cn(
                "rounded-md px-4 py-2 text-sm",
                statusMsg.type === "success"
                  ? "bg-green-500/10 text-green-400"
                  : "bg-red-500/10 text-red-400"
              )}
            >
              {statusMsg.message}
            </div>
          )}

          {/* Add Server button */}
          <div className="flex justify-end">
            <button
              onClick={() => setAdding(!adding)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {adding ? "Cancel" : "Add Server"}
            </button>
          </div>

          {/* Add Server Form */}
          {adding && (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="mb-4 font-medium">Add MCP Server</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. github, filesystem, notion"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    Transport
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFormTransport("stdio")}
                      className={cn(
                        "rounded-md px-4 py-2 text-sm",
                        formTransport === "stdio"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      stdio (local)
                    </button>
                    <button
                      onClick={() => setFormTransport("http")}
                      className={cn(
                        "rounded-md px-4 py-2 text-sm",
                        formTransport === "http"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      HTTP (remote)
                    </button>
                  </div>
                </div>

                {formTransport === "stdio" ? (
                  <>
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">
                        Command <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={formCommand}
                        onChange={(e) => setFormCommand(e.target.value)}
                        placeholder="e.g. npx, node, python"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none ring-ring focus:ring-2"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">
                        Arguments (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={formArgs}
                        onChange={(e) => setFormArgs(e.target.value)}
                        placeholder="e.g. -y, @modelcontextprotocol/server-github"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none ring-ring focus:ring-2"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-muted-foreground">
                        Environment Variables (one KEY=VALUE per line)
                      </label>
                      <textarea
                        value={formEnv}
                        onChange={(e) => setFormEnv(e.target.value)}
                        placeholder={"GITHUB_TOKEN=ghp_...\nAPI_KEY=sk-..."}
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none ring-ring focus:ring-2"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="mb-1 block text-sm text-muted-foreground">
                      Server URL <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      placeholder="https://mcp.example.com/sse"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none ring-ring focus:ring-2"
                    />
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handleAdd}
                    disabled={
                      saving ||
                      !formName ||
                      (formTransport === "stdio" && !formCommand) ||
                      (formTransport === "http" && !formUrl)
                    }
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? "Connecting..." : "Connect & Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="py-12 text-center text-muted-foreground">
              Loading MCP servers...
            </div>
          )}

          {/* User Servers */}
          {!loading && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Your Servers
              </h2>
              {userServers.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  No MCP servers configured. Click &ldquo;Add Server&rdquo; to
                  connect one.
                </p>
              ) : (
                <div className="space-y-3">
                  {userServers.map((server) => (
                    <ServerCard
                      key={server.id}
                      server={server}
                      expanded={expanded === server.id}
                      onToggleExpand={() =>
                        setExpanded(
                          expanded === server.id ? null : server.id
                        )
                      }
                      onDelete={() => handleDelete(server.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Global Servers */}
          {!loading && globalServers.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Global Servers (from config file)
              </h2>
              <div className="space-y-3">
                {globalServers.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    expanded={expanded === server.id}
                    onToggleExpand={() =>
                      setExpanded(expanded === server.id ? null : server.id)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServerCard({
  server,
  expanded,
  onToggleExpand,
  onDelete,
}: {
  server: McpServer;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          <div>
            <h3 className="font-medium">{server.name}</h3>
            <p className="text-xs text-muted-foreground">
              {server.transport === "stdio"
                ? `${server.command} ${(server.args ?? []).join(" ")}`
                : server.url}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {server.tools.length} tool{server.tools.length !== 1 ? "s" : ""}
          </span>
          <StatusBadge status={server.status} />
          {server.scope === "global" && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              global
            </span>
          )}
        </div>
      </div>

      {/* Error message */}
      {server.error && (
        <div className="border-t border-border px-4 py-2 text-xs text-red-400">
          {server.error}
        </div>
      )}

      {/* Expanded: show tools */}
      {expanded && (
        <div className="border-t border-border p-4">
          {server.tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tools discovered
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Discovered Tools:
              </p>
              {server.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-start justify-between rounded bg-muted p-2"
                >
                  <div>
                    <p className="text-sm font-mono">{tool.name}</p>
                    {tool.description && (
                      <p className="text-xs text-muted-foreground">
                        {tool.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded px-2 py-0.5 text-xs",
                      tool.permission === "read-only"
                        ? "bg-green-500/10 text-green-400"
                        : tool.permission === "destructive"
                          ? "bg-red-500/10 text-red-400"
                          : "bg-yellow-500/10 text-yellow-400"
                    )}
                  >
                    {tool.permission}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Delete button (user servers only) */}
          {onDelete && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded-md px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
              >
                Remove Server
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: "bg-green-500/10 text-green-400",
    connecting: "bg-yellow-500/10 text-yellow-400",
    error: "bg-red-500/10 text-red-400",
    disconnected: "bg-muted text-muted-foreground",
    disabled: "bg-muted text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        colors[status] ?? colors.disconnected
      )}
    >
      {status}
    </span>
  );
}
