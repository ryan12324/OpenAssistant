"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: { content: string }[];
}

export function Sidebar() {
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/conversations")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setConversations(data);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-card transition-all",
        collapsed ? "w-16" : "w-72"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              OA
            </div>
            <span className="font-semibold">OpenAssistant</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {collapsed ? (
              <path d="M9 18l6-6-6-6" />
            ) : (
              <path d="M15 18l-6-6 6-6" />
            )}
          </svg>
        </button>
      </div>

      {/* New Chat */}
      <div className="p-3">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted",
            collapsed && "justify-center px-2"
          )}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {!collapsed && <span>New Chat</span>}
        </Link>
      </div>

      {/* Navigation */}
      {!collapsed && (
        <nav className="px-3 pb-2">
          <Link
            href="/"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              pathname === "/"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chat
          </Link>
          <Link
            href="/memory"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              pathname === "/memory"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.57-3.25 3.92L12 22l-.75-12.08A4.001 4.001 0 0 1 12 2z" />
            </svg>
            Memory
          </Link>
          <Link
            href="/integrations"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              pathname === "/integrations"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
              <circle cx="8" cy="6" r="1.5" fill="currentColor" />
              <circle cx="16" cy="12" r="1.5" fill="currentColor" />
              <circle cx="10" cy="18" r="1.5" fill="currentColor" />
            </svg>
            Integrations
          </Link>
          <Link
            href="/teams"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              pathname === "/teams"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Teams
          </Link>
          <Link
            href="/skills"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              pathname === "/skills"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            Skills
          </Link>
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              pathname === "/settings"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            Settings
          </Link>
        </nav>
      )}

      {/* Conversation History */}
      {!collapsed && conversations.length > 0 && (
        <div className="flex-1 overflow-y-auto px-3">
          <p className="mb-2 px-3 text-xs font-medium uppercase text-muted-foreground">
            Recent
          </p>
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/chat/${conv.id}`}
              className={cn(
                "block truncate rounded-md px-3 py-2 text-sm",
                pathname === `/chat/${conv.id}`
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {conv.title}
            </Link>
          ))}
        </div>
      )}

      {/* User / Sign Out */}
      <div className="border-t border-border p-3">
        <button
          onClick={() => signOut().then(() => (window.location.href = "/sign-in"))}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
            collapsed && "justify-center"
          )}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
