"use client";

import { useState, useRef, useEffect } from "react";

interface UploadedFile {
  name: string;
  size: number;
  uploading: boolean;
  error?: string;
  result?: {
    docId: string;
    contentLength: number;
    tables: number;
    images: number;
  };
}

interface ChatInputProps {
  onSend: (message: string, attachments?: UploadedFile[]) => void;
  disabled?: boolean;
}

const SUPPORTED_EXTENSIONS = [
  ".pdf", ".docx", ".doc", ".odt", ".rtf",
  ".xlsx", ".xlsm", ".xls", ".ods", ".csv", ".tsv",
  ".pptx", ".ppt",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".svg",
  ".html", ".htm", ".xml",
  ".json", ".yaml", ".yml", ".toml",
  ".txt", ".md", ".rst",
  ".tex", ".epub", ".eml", ".msg",
  ".zip", ".tar", ".gz",
  ".ipynb",
];

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  async function uploadFile(file: File) {
    const fileEntry: UploadedFile = {
      name: file.name,
      size: file.size,
      uploading: true,
    };
    setFiles((prev) => [...prev, fileEntry]);

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
        setFiles((prev) =>
          prev.map((f) =>
            f.name === file.name && f.uploading
              ? { ...f, uploading: false, error: data.error || "Upload failed" }
              : f
          )
        );
        return;
      }

      setFiles((prev) =>
        prev.map((f) =>
          f.name === file.name && f.uploading
            ? {
                ...f,
                uploading: false,
                result: {
                  docId: data.docId,
                  contentLength: data.contentLength,
                  tables: data.tables,
                  images: data.images,
                },
              }
            : f
        )
      );
    } catch {
      setFiles((prev) =>
        prev.map((f) =>
          f.name === file.name && f.uploading
            ? { ...f, uploading: false, error: "Upload failed" }
            : f
        )
      );
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected) return;
    for (const file of Array.from(selected)) {
      uploadFile(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files;
    for (const file of Array.from(dropped)) {
      uploadFile(file);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    const hasFiles = files.some((f) => f.result);
    if ((!trimmed && !hasFiles) || disabled) return;

    // Build message with file context
    let message = trimmed;
    const uploadedFiles = files.filter((f) => f.result);
    if (uploadedFiles.length > 0 && !trimmed) {
      message = `I've uploaded ${uploadedFiles.length} file(s): ${uploadedFiles.map((f) => f.name).join(", ")}. Please analyze the content.`;
    } else if (uploadedFiles.length > 0) {
      const fileInfo = uploadedFiles
        .map(
          (f) =>
            `[Uploaded: ${f.name} — ${f.result!.contentLength} chars, ${f.result!.tables} tables, ${f.result!.images} images, doc ID: ${f.result!.docId}]`
        )
        .join("\n");
      message = `${fileInfo}\n\n${trimmed}`;
    }

    onSend(message, files);
    setInput("");
    setFiles([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const isUploading = files.some((f) => f.uploading);

  return (
    <form
      onSubmit={handleSubmit}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="border-t border-border p-4"
    >
      <div className="mx-auto max-w-3xl">
        {/* File attachments preview */}
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs"
              >
                {/* File icon */}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="shrink-0 text-muted-foreground"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="max-w-[150px] truncate">{file.name}</span>

                {file.uploading && (
                  <span className="text-muted-foreground animate-pulse">
                    uploading...
                  </span>
                )}
                {file.error && (
                  <span className="text-red-400">{file.error}</span>
                )}
                {file.result && (
                  <span className="text-green-400">
                    {(file.result.contentLength / 1000).toFixed(0)}k chars
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          {/* File upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            className="shrink-0 rounded-md border border-input p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            title="Upload file (PDF, DOCX, images, and 75+ formats)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={SUPPORTED_EXTENSIONS.join(",")}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Text input */}
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                files.length > 0
                  ? "Add a message about the uploaded file(s)..."
                  : "Message OpenAssistant... (drop files here)"
              }
              disabled={disabled}
              rows={1}
              className="w-full resize-none rounded-lg border border-input bg-card px-4 py-3 pr-12 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={
                (!input.trim() && !files.some((f) => f.result)) ||
                disabled ||
                isUploading
              }
              className="absolute bottom-2 right-2 rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-30"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
              </svg>
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          OpenAssistant can make mistakes. Verify important information.
          Supports 75+ file formats via kreuzberg.
        </p>
      </div>
    </form>
  );
}
