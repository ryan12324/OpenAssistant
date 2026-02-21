"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export interface ToolCall {
  id: string;
  name: string;
  state: "calling" | "result" | "error";
  args?: string;
  result?: string;
}

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCall[];
}

export function ChatMessage({ role, content, toolCalls }: ChatMessageProps) {
  if (role === "system") return null;

  return (
    <div
      className={cn(
        "flex gap-4 px-4 py-4",
        role === "user" ? "justify-end" : "justify-start"
      )}
    >
      {role === "assistant" && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          OA
        </div>
      )}

      <div
        className={cn(
          "max-w-[75%] rounded-lg px-4 py-3 text-sm",
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-card text-card-foreground"
        )}
      >
        {/* Tool calls (collapsed by default) */}
        {role === "assistant" && toolCalls && toolCalls.length > 0 && (
          <div className="mb-2 space-y-1">
            {toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {role === "assistant" ? (
          <div className="prose-chat">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>

      {role === "user" && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
          You
        </div>
      )}
    </div>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [open, setOpen] = useState(false);

  // Friendly display name: strip mcp_ prefix, replace underscores
  const displayName = toolCall.name
    .replace(/^mcp_[^_]+__/, "")
    .replace(/_/g, " ");

  const isRunning = toolCall.state === "calling";
  const isError = toolCall.state === "error";

  return (
    <div className="rounded-md border border-border bg-background/50 text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {/* Status icon */}
        {isRunning ? (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        ) : isError ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-red-400">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-green-400">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}

        {/* Tool name */}
        <span className={cn("flex-1 font-medium", isError && "text-red-400")}>
          {displayName}
          {isRunning && <span className="ml-1 text-muted-foreground">...</span>}
        </span>

        {/* Chevron */}
        {!isRunning && (
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {/* Collapsed content */}
      {open && !isRunning && (
        <div className="border-t border-border px-2.5 py-2 text-muted-foreground">
          {toolCall.args && (
            <div className="mb-1.5">
              <span className="font-medium text-foreground/60">Input: </span>
              <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-1.5 text-[11px]">
                {formatJson(toolCall.args)}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <span className="font-medium text-foreground/60">Output: </span>
              <pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-1.5 text-[11px]">
                {formatJson(toolCall.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}
