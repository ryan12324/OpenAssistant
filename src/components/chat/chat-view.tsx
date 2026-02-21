"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";
import type { ToolCall } from "./chat-message";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

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
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [isLoading, setIsLoading] = useState(false);
  const [currentConvId, setCurrentConvId] = useState(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    // Prepare assistant message placeholder
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    // Check for /team or /swarm commands
    const command = parseCommand(content);
    if (command.type !== "none" && command.id && command.task) {
      try {
        abortRef.current = new AbortController();
        await handleAgentCommand(
          command as { type: "team" | "swarm"; id: string; task: string },
          assistantId
        );
      } finally {
        setIsLoading(false);
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

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `**Usage:** \`/${cmdType} <${cmdType}-id> <task description>\`\n\n**Examples:**\n${examples}`,
              }
            : m
        )
      );
      setIsLoading(false);
      return;
    }

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          conversationId: currentConvId,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Get conversation ID from response header
      const convId = res.headers.get("X-Conversation-Id");
      if (convId && !currentConvId) {
        setCurrentConvId(convId);
        // Update URL without navigation
        window.history.replaceState(null, "", `/chat/${convId}`);
      }

      // Stream the response — parse the full Vercel AI SDK data stream protocol
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      const toolCalls = new Map<string, ToolCall>();

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line) continue;

            try {
              // 0: text delta
              if (line.startsWith("0:")) {
                const text = JSON.parse(line.slice(2));
                fullContent += text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: fullContent, toolCalls: [...toolCalls.values()] }
                      : m
                  )
                );
              }
              // 9: tool call begin — {"toolCallId":"...","toolName":"..."}
              else if (line.startsWith("9:")) {
                const data = JSON.parse(line.slice(2));
                toolCalls.set(data.toolCallId, {
                  id: data.toolCallId,
                  name: data.toolName,
                  state: "calling",
                  args: "",
                });
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, toolCalls: [...toolCalls.values()] }
                      : m
                  )
                );
              }
              // b: tool call delta (streaming args)
              else if (line.startsWith("b:")) {
                const data = JSON.parse(line.slice(2));
                const tc = toolCalls.get(data.toolCallId);
                if (tc) {
                  tc.args = (tc.args || "") + (data.argsTextDelta || "");
                }
              }
              // a: tool result — {"toolCallId":"...","result":"..."}
              else if (line.startsWith("a:")) {
                const data = JSON.parse(line.slice(2));
                const tc = toolCalls.get(data.toolCallId);
                if (tc) {
                  tc.state = "result";
                  tc.result = typeof data.result === "string"
                    ? data.result
                    : JSON.stringify(data.result);
                } else {
                  toolCalls.set(data.toolCallId, {
                    id: data.toolCallId,
                    name: "tool",
                    state: "result",
                    result: typeof data.result === "string"
                      ? data.result
                      : JSON.stringify(data.result),
                  });
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, toolCalls: [...toolCalls.values()] }
                      : m
                  )
                );
              }
              // e: finish with metadata (step boundary)
              // d: error
              else if (line.startsWith("d:")) {
                const data = JSON.parse(line.slice(2));
                if (!fullContent) {
                  fullContent = typeof data === "string" ? data : (data.message || "An error occurred.");
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: fullContent, toolCalls: [...toolCalls.values()] }
                        : m
                    )
                  );
                }
              }
              // Other prefixes (e:, c:, etc.) — skip silently
            } catch {
              // Skip malformed lines
            }
          }
        }
      }

      // If no text was streamed but tool calls happened, show a summary
      if (!fullContent && toolCalls.size > 0) {
        fullContent = "Done.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: fullContent, toolCalls: [...toolCalls.values()] }
              : m
          )
        );
      } else if (!fullContent) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "I processed your request." }
              : m
          )
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Sorry, I encountered an error. Please try again.",
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }

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
                role={msg.role}
                content={msg.content}
                toolCalls={msg.toolCalls}
              />
            ))}
            {isLoading &&
              messages[messages.length - 1]?.role === "assistant" &&
              !messages[messages.length - 1]?.content &&
              !(messages[messages.length - 1]?.toolCalls?.length) && (
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
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
