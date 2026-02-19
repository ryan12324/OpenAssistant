"use client";

import { useSession } from "@/lib/auth-client";
import { useState, useEffect } from "react";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [ragHealth, setRagHealth] = useState<{
    status: string;
    lightrag: boolean;
    rag_anything: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setRagHealth)
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your OpenAssistant instance
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Account Info */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-medium">Account</h2>
            {session?.user ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="text-sm">{session.user.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm">{session.user.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
          </div>

          {/* RAG System Status */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-medium">Memory System (RAG)</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm">LightRAG Engine</p>
                <StatusBadge active={ragHealth?.lightrag} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm">RAG-Anything (Multimodal)</p>
                <StatusBadge active={ragHealth?.rag_anything} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm">Server Status</p>
                <StatusBadge active={ragHealth?.status === "ok"} />
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              The memory system uses LightRAG with a knowledge graph for
              persistent memory. RAG-Anything enables multimodal document
              processing (PDFs, images, tables).
            </p>
          </div>

          {/* Architecture Info */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-medium">Architecture</h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Frontend:</strong> Next.js
                + TypeScript + Tailwind CSS
              </p>
              <p>
                <strong className="text-foreground">Auth:</strong> Better
                Auth with email/password and OAuth
              </p>
              <p>
                <strong className="text-foreground">AI:</strong> Vercel AI
                SDK with OpenAI-compatible models
              </p>
              <p>
                <strong className="text-foreground">Memory:</strong> LightRAG
                knowledge graph + RAG-Anything
              </p>
              <p>
                <strong className="text-foreground">Database:</strong> SQLite
                via Prisma ORM
              </p>
              <p>
                <strong className="text-foreground">Skills:</strong>{" "}
                Extensible plugin system with memory, web, and productivity
                tools
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ active }: { active?: boolean }) {
  if (active === undefined) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        checking...
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? "bg-green-500/10 text-green-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
