"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import type { UIToolInvocation, UITool } from "ai";

type MessagePart =
  | { type: "text"; text: string }
  | { type: "tool-invocation"; toolInvocation: UIToolInvocation<UITool> }
  | { type: "reasoning"; reasoning: string }
  | { type: "step-start" };

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parts?: any[];
}

export function ChatMessage({ role, content, parts }: ChatMessageProps) {
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
        {role === "assistant" && parts ? (
          <AssistantParts parts={parts} />
        ) : role === "assistant" ? (
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

function AssistantParts({ parts }: { parts: unknown[] }) {
  if (!parts || parts.length === 0) return null;

  return (
    <>
      {parts.map((rawPart, i) => {
        const part = rawPart as MessagePart;
        if (part.type === "text") {
          if (!part.text) return null;
          return (
            <div key={i} className="prose-chat">
              <ReactMarkdown>{part.text}</ReactMarkdown>
            </div>
          );
        }
        if (part.type === "tool-invocation") {
          return (
            <div key={i} className="mb-2">
              <ToolCallCard toolInvocation={part.toolInvocation} />
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

function ToolCallCard({ toolInvocation }: { toolInvocation: UIToolInvocation<UITool> }) {
  const [open, setOpen] = useState(false);

  const displayName = (toolInvocation.title ?? toolInvocation.toolCallId)
    .replace(/^mcp_[^_]+__/, "")
    .replace(/_/g, " ");

  const isRunning =
    toolInvocation.state === "input-available" || toolInvocation.state === "input-streaming";
  const isResult = toolInvocation.state === "output-available";

  return (
    <div className="rounded-md border border-border bg-background/50 text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {/* Status icon */}
        {isRunning ? (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        ) : isResult ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="shrink-0 text-green-400"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="shrink-0 text-red-400"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        )}

        {/* Tool name */}
        <span className="flex-1 font-medium">
          {displayName}
          {isRunning && (
            <span className="ml-1 text-muted-foreground">...</span>
          )}
        </span>

        {/* Chevron */}
        {!isRunning && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              "shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {/* Collapsed content */}
      {open && !isRunning && (
        <div className="border-t border-border px-2.5 py-2 text-muted-foreground">
          {toolInvocation.input != null && (
            <div className="mb-1.5">
              <span className="font-medium text-foreground/60">Input: </span>
              <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-1.5 text-[11px]">
                {formatJson(
                  typeof toolInvocation.input === "string"
                    ? toolInvocation.input
                    : JSON.stringify(toolInvocation.input)
                )}
              </pre>
            </div>
          )}
          {"output" in toolInvocation && toolInvocation.output != null && (
            <div>
              <span className="font-medium text-foreground/60">Output: </span>
              <pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-1.5 text-[11px]">
                {formatJson(
                  typeof toolInvocation.output === "string"
                    ? toolInvocation.output
                    : JSON.stringify(toolInvocation.output)
                )}
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
