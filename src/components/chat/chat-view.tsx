"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatViewProps {
  conversationId?: string;
  initialMessages?: Message[];
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

      // Stream the response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          // Parse the Vercel AI SDK data stream format
          const lines = chunk.split("\n");
          for (const line of lines) {
            // Text delta format: 0:"text"
            if (line.startsWith("0:")) {
              try {
                const text = JSON.parse(line.slice(2));
                fullContent += text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullContent } : m
                  )
                );
              } catch {
                // Skip malformed chunks
              }
            }
          }
        }
      }

      // If no content was streamed, show a fallback
      if (!fullContent) {
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
                "Help me organize my thoughts",
                "What can you do?",
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
              />
            ))}
            {isLoading &&
              messages[messages.length - 1]?.role === "assistant" &&
              !messages[messages.length - 1]?.content && (
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
