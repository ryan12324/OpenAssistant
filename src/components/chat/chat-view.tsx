"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "ai/react";
import type { Message, CreateMessage } from "ai/react";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";

interface ChatViewProps {
  conversationId?: string;
  initialMessages?: Message[];
}

// Parse /team and /swarm commands from user input
function parseCommand(content: string): {
  type: "team" | "swarm" | "none";
  id?: string;
  task?: string;
} {
  const teamMatch = content.match(/^\/team\s+(\S+)\s+([\s\S]+)/);
  if (teamMatch) {
    return { type: "team", id: teamMatch[1], task: teamMatch[2].trim() };
  }
  const swarmMatch = content.match(/^\/swarm\s+(\S+)\s+([\s\S]+)/);
  if (swarmMatch) {
    return { type: "swarm", id: swarmMatch[1], task: swarmMatch[2].trim() };
  }
  return { type: "none" };
}

// Format team/swarm results as markdown for display in chat
function formatAgentResult(result: {
  finalOutput?: string;
  durationMs?: number;
  agentResults?: { agentName: string; output: string; durationMs: number; error?: string }[];
  strategy?: string;
  aggregation?: string;
}): string {
  let md = "";
  if (result.strategy) {
    md += `**Strategy:** ${result.strategy}\n\n`;
  }
  if (result.aggregation) {
    md += `**Aggregation:** ${result.aggregation}\n\n`;
  }
  if (result.durationMs) {
    md += `**Duration:** ${(result.durationMs / 1000).toFixed(1)}s\n\n`;
  }
  md += `---\n\n${result.finalOutput || "No output produced."}\n\n`;
  if (result.agentResults && result.agentResults.length > 0) {
    md += `---\n\n**Agent Outputs:**\n\n`;
    for (const ar of result.agentResults) {
      md += `**${ar.agentName}** (${(ar.durationMs / 1000).toFixed(1)}s)${ar.error ? ` — Error: ${ar.error}` : ""}\n\n`;
      md += `${ar.output.slice(0, 800)}${ar.output.length > 800 ? "\n\n*...truncated*" : ""}\n\n`;
    }
  }
  return md;
}

export function ChatView({ conversationId, initialMessages }: ChatViewProps) {
  const [currentConvId, setCurrentConvId] = useState(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  const {
    messages,
    setMessages,
    append,
    status,
    error,
  } = useChat({
    api: "/api/chat",
    initialMessages: initialMessages || [],
    body: { conversationId: currentConvId },
    maxSteps: 10,
    onResponse(response) {
      const convId = response.headers.get("X-Conversation-Id");
      if (convId && !currentConvId) {
        setCurrentConvId(convId);
        window.history.replaceState(null, "", `/chat/${convId}`);
        window.dispatchEvent(new CustomEvent("conversationCreated"));
      }
    },
  });

  const isLoading = status !== "ready" || agentLoading;

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle /team and /swarm slash commands
  async function handleAgentCommand(
    command: { type: "team" | "swarm"; id: string; task: string },
    assistantId: string,
  ) {
    const endpoint =
      command.type === "team" ? "/api/agents/teams" : "/api/agents/swarms";
    const idKey = command.type === "team" ? "teamId" : "swarmId";

    // Show a "running" indicator
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content: `Running ${command.type} **${command.id}**...\n\nTask: ${command.task}`,
            }
          : m
      )
    );

    // Try streaming first for teams
    if (command.type === "team") {
      try {
        const res = await fetch("/api/agents/teams/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: command.id, task: command.task }),
          signal: abortRef.current?.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        const events: string[] = [];
        let finalOutput = "";
        let durationMs = 0;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const event = JSON.parse(line.slice(6));
                  if (event.type === "agent_start") {
                    events.push(`Started **${event.agentName}**`);
                  } else if (event.type === "agent_done") {
                    events.push(
                      `**${event.agentName}** finished (${event.durationMs}ms)`
                    );
                  } else if (event.type === "handoff") {
                    events.push(
                      `Handoff: ${event.from} -> ${event.to}: ${event.reason}`
                    );
                  } else if (event.type === "round_start") {
                    events.push(
                      `--- Round ${event.round}/${event.maxRounds} ---`
                    );
                  } else if (event.type === "complete") {
                    finalOutput = event.finalOutput || "";
                    durationMs = event.durationMs || 0;
                  } else if (event.type === "error") {
                    events.push(`Error: ${event.error}`);
                  }

                  // Update the message with live progress
                  const progress = events.join("\n\n");
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content: `**Team: ${command.id}** | Task: ${command.task}\n\n${progress}${
                              finalOutput
                                ? `\n\n---\n\n**Result** (${(durationMs / 1000).toFixed(1)}s):\n\n${finalOutput}`
                                : "\n\n*Running...*"
                            }`,
                          }
                        : m
                    )
                  );
                } catch {
                  // Skip malformed SSE events
                }
              }
            }
          }
        }

        if (!finalOutput) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `**Team: ${command.id}** completed but produced no output.\n\n${events.join("\n\n")}`,
                  }
                : m
            )
          );
        }

        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Fall through to non-streaming
      }
    }

    // Non-streaming fallback (also used for swarms)
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [idKey]: command.id, task: command.task }),
        signal: abortRef.current?.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const formatted = formatAgentResult(data);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `**${command.type === "team" ? "Team" : "Swarm"}: ${command.id}**\n\n${formatted}`,
              }
            : m
        )
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const errMsg =
        error instanceof Error ? error.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `Failed to run ${command.type} **${command.id}**: ${errMsg}\n\nAvailable commands:\n- \`/team <team-id> <task>\`\n- \`/swarm <swarm-id> <task>\`\n\nUse the Teams page to see available team and swarm IDs.`,
              }
            : m
        )
      );
    }
  }

  async function handleSend(content: string) {
    // Check for /team or /swarm commands
    const command = parseCommand(content);
    if (command.type !== "none" && command.id && command.task) {
      // Handle team/swarm commands manually (outside useChat)
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        parts: [{ type: "text" as const, text: content }],
      };
      const assistantId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        parts: [{ type: "text" as const, text: "" }],
      };
      setMessages([...messages, userMsg, assistantMsg]);
      setAgentLoading(true);
      try {
        abortRef.current = new AbortController();
        await handleAgentCommand(
          command as { type: "team" | "swarm"; id: string; task: string },
          assistantId
        );
      } finally {
        setAgentLoading(false);
      }
      return;
    }

    // Show help for incomplete /team or /swarm commands
    if (content.startsWith("/team") || content.startsWith("/swarm")) {
      const cmdType = content.startsWith("/team") ? "team" : "swarm";
      const examples =
        cmdType === "team"
          ? "- `/team research-team Research quantum computing advances`\n- `/team code-review-team Review this React component for issues`\n- `/team debate-team Should we use microservices or monolith?`\n- `/team planning-team Plan a mobile app for task management`\n- `/team creative-team Write a tagline for an AI product`"
          : "- `/swarm analysis-swarm Analyze the pros and cons of remote work`\n- `/swarm fact-check-swarm The Great Wall is visible from space`\n- `/swarm translation-swarm Translate 'Hello, how are you?' to French`";

      const helpContent = `**Usage:** \`/${cmdType} <${cmdType}-id> <task description>\`\n\n**Examples:**\n${examples}`;
      setMessages([
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "user" as const,
          content,
          parts: [{ type: "text" as const, text: content }],
        },
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: helpContent,
          parts: [{ type: "text" as const, text: helpContent }],
        },
      ]);
      return;
    }

    // Normal message — use the useChat append which handles streaming automatically
    await append({ role: "user", content } as CreateMessage);
  }

  // Check if the last assistant message is still loading (submitted but no content yet)
  const lastMsg = messages[messages.length - 1];
  const showLoading =
    (status === "submitted" || agentLoading) &&
    lastMsg?.role === "assistant" &&
    !lastMsg.content &&
    (!lastMsg.parts || lastMsg.parts.length === 0);

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-primary-foreground">
              OA
            </div>
            <h2 className="text-xl font-semibold">
              How can I help you today?
            </h2>
            <p className="max-w-md text-center text-muted-foreground">
              I&apos;m your personal AI assistant with persistent memory. I
              remember our past conversations and learn your preferences
              over time.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                "What do you remember about me?",
                "Search the web for latest AI news",
                "/team research-team Explain quantum computing",
                "/swarm analysis-swarm Compare React vs Vue",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSend(suggestion)}
                  className="rounded-lg border border-border px-4 py-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl py-4">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role as "user" | "assistant" | "system"}
                content={msg.content}
                parts={msg.parts}
              />
            ))}
            {showLoading && (
              <div className="flex gap-4 px-4 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                  OA
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-card px-4 py-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                </div>
              </div>
            )}
            {error && (
              <div className="mx-4 my-2 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
                {error.message || "An error occurred. Please try again."}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
