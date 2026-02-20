"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
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
