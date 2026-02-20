"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Memory {
  id: string;
  type: string;
  content: string;
  summary: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

type MemoryFilter = "all" | "short_term" | "long_term" | "episodic";

interface FileUploadResult {
  fileName: string;
  status: "uploading" | "done" | "error";
  error?: string;
  contentLength?: number;
  tables?: number;
  images?: number;
  keywords?: string[];
}

function FileUploadSection({ onUploaded }: { onUploaded: () => void }) {
  const [uploads, setUploads] = useState<FileUploadResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList) {
    for (const file of Array.from(fileList)) {
      setUploads((prev) => [
        ...prev,
        { fileName: file.name, status: "uploading" },
      ]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", file.name);

        const res = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setUploads((prev) =>
            prev.map((u) =>
              u.fileName === file.name && u.status === "uploading"
                ? { ...u, status: "error", error: data.error }
                : u
            )
          );
          continue;
        }

        setUploads((prev) =>
          prev.map((u) =>
            u.fileName === file.name && u.status === "uploading"
              ? {
                  ...u,
                  status: "done",
                  contentLength: data.contentLength,
                  tables: data.tables,
                  images: data.images,
                  keywords: data.keywords,
                }
              : u
          )
        );
        onUploaded();
      } catch {
        setUploads((prev) =>
          prev.map((u) =>
            u.fileName === file.name && u.status === "uploading"
              ? { ...u, status: "error", error: "Upload failed" }
              : u
          )
        );
      }
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed bg-card p-4 transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-border"
      )}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Ingest Files</h2>
          <p className="text-xs text-muted-foreground">
            Drop files here or click to upload. Supports PDF, DOCX, XLSX, images (OCR), and 75+ formats.
          </p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="shrink-0 rounded-md bg-muted px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted/80"
        >
          Choose Files
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
      </div>

      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((u, i) => (
            <div
              key={`${u.fileName}-${i}`}
              className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs"
            >
              <span className="truncate">{u.fileName}</span>
              {u.status === "uploading" && (
                <span className="animate-pulse text-muted-foreground">
                  Processing...
                </span>
              )}
              {u.status === "error" && (
                <span className="text-red-400">{u.error}</span>
              )}
              {u.status === "done" && (
                <span className="text-green-400">
                  {((u.contentLength || 0) / 1000).toFixed(0)}k chars
                  {u.tables ? `, ${u.tables} tables` : ""}
                  {u.images ? `, ${u.images} images` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<MemoryFilter>("all");
  const [loading, setLoading] = useState(true);
  const [newMemory, setNewMemory] = useState("");
  const [newMemoryType, setNewMemoryType] = useState<"long_term" | "episodic">("long_term");
  const [saving, setSaving] = useState(false);

  async function loadMemories() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("type", filter);
      params.set("limit", "50");

      const res = await fetch(`/api/memory?${params}`);
      const data = await res.json();
      setMemories(data.memories || []);
      setTotal(data.total || 0);
    } catch {
      // Handle error silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMemories();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!newMemory.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newMemory,
          type: newMemoryType,
        }),
      });
      setNewMemory("");
      loadMemories();
    } catch {
      // Handle error
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(memoryId: string) {
    try {
      await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId }),
      });
      loadMemories();
    } catch {
      // Handle error
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Memory</h1>
        <p className="text-sm text-muted-foreground">
          Your assistant&apos;s persistent knowledge graph — {total} memories stored.
          Upload files (PDF, DOCX, images, and 75+ formats) to add to the knowledge base.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Add Memory */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">Add Memory</h2>
            <textarea
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              placeholder="Store a fact, preference, or note..."
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
            />
            <div className="mt-3 flex items-center justify-between">
              <select
                value={newMemoryType}
                onChange={(e) => setNewMemoryType(e.target.value as "long_term" | "episodic")}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none"
              >
                <option value="long_term">Long-term</option>
                <option value="episodic">Episodic</option>
              </select>
              <button
                onClick={handleSave}
                disabled={!newMemory.trim() || saving}
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Memory"}
              </button>
            </div>
          </div>

          {/* File Upload */}
          <FileUploadSection onUploaded={loadMemories} />

          {/* Filters */}
          <div className="flex gap-2">
            {(["all", "short_term", "long_term", "episodic"] as const).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm",
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "all"
                    ? "All"
                    : f
                        .split("_")
                        .map(
                          (w) => w.charAt(0).toUpperCase() + w.slice(1)
                        )
                        .join(" ")}
                </button>
              )
            )}
          </div>

          {/* Memory List */}
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              Loading memories...
            </div>
          ) : memories.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-lg">No memories yet</p>
              <p className="mt-1 text-sm">
                Chat with your assistant to start building your knowledge graph.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="group rounded-lg border border-border bg-card p-4"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        memory.type === "long_term" &&
                          "bg-blue-500/10 text-blue-400",
                        memory.type === "short_term" &&
                          "bg-yellow-500/10 text-yellow-400",
                        memory.type === "episodic" &&
                          "bg-purple-500/10 text-purple-400"
                      )}
                    >
                      {memory.type.replace("_", " ")}
                    </span>
                    <button
                      onClick={() => handleDelete(memory.id)}
                      className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-destructive group-hover:opacity-100"
                      title="Delete memory"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm">{memory.content}</p>
                  {memory.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {memory.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(memory.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
