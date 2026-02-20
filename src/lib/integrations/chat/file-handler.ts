import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { memoryManager } from "@/lib/rag/memory";
import { extractFromFile, SUPPORTED_EXTENSIONS } from "@/lib/rag/extractor";
import type { InboundAttachment } from "../types";

const UPLOAD_DIR = join(process.cwd(), ".uploads");

export interface ChatFileResult {
  success: boolean;
  docId?: string;
  fileName: string;
  contentLength?: number;
  tables?: number;
  images?: number;
  keywords?: string[];
  error?: string;
}

/**
 * Download a file from a URL with optional auth headers,
 * extract it via kreuzberg-node, and ingest it into the RAG knowledge graph.
 */
export async function downloadAndIngestFile(params: {
  url: string;
  fileName: string;
  mimeType?: string;
  headers?: Record<string, string>;
  userId: string;
  source: string;
}): Promise<ChatFileResult> {
  const ext =
    "." + (params.fileName.split(".").pop()?.toLowerCase() || "bin");
  const supported = SUPPORTED_EXTENSIONS.includes(ext);

  if (!supported) {
    return {
      success: false,
      fileName: params.fileName,
      error: `Unsupported file type: ${ext}`,
    };
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const fileId = randomUUID();
  const filePath = join(UPLOAD_DIR, `${fileId}${ext}`);

  try {
    // Download the file
    const res = await fetch(params.url, {
      headers: params.headers || {},
    });

    if (!res.ok) {
      return {
        success: false,
        fileName: params.fileName,
        error: `Download failed: HTTP ${res.status}`,
      };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(filePath, buffer);

    // Extract and ingest
    const { docId, extracted } = await memoryManager.ingestFile({
      userId: params.userId,
      filePath,
      title: `[${params.source}] ${params.fileName}`,
      extractOptions: {
        enableOcr: true,
        extractTables: true,
        extractKeywords: true,
        enableQualityProcessing: true,
      },
    });

    return {
      success: true,
      docId,
      fileName: params.fileName,
      contentLength: extracted.content.length,
      tables: extracted.tables.length,
      images: extracted.imageCount,
      keywords: extracted.keywords.slice(0, 10),
    };
  } catch (error) {
    return {
      success: false,
      fileName: params.fileName,
      error: error instanceof Error ? error.message : "Processing failed",
    };
  } finally {
    // Clean up temp file
    await unlink(filePath).catch(() => {});
  }
}

/**
 * Process multiple inbound attachments from a chat message.
 * Downloads each file, extracts content, and ingests into RAG.
 */
export async function processInboundAttachments(params: {
  attachments: InboundAttachment[];
  headers?: Record<string, string>;
  userId: string;
  source: string;
}): Promise<ChatFileResult[]> {
  const results: ChatFileResult[] = [];

  for (const attachment of params.attachments) {
    if (!attachment.url) {
      results.push({
        success: false,
        fileName: attachment.fileName,
        error: "No download URL available",
      });
      continue;
    }

    const result = await downloadAndIngestFile({
      url: attachment.url,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      headers: params.headers,
      userId: params.userId,
      source: params.source,
    });

    results.push(result);
  }

  return results;
}

/**
 * Format file processing results into a human-readable summary.
 */
export function formatFileResults(results: ChatFileResult[]): string {
  if (results.length === 0) return "No files processed.";

  const lines = results.map((r) => {
    if (r.success) {
      const parts = [`${r.fileName}: ${r.contentLength} chars extracted`];
      if (r.tables && r.tables > 0) parts.push(`${r.tables} tables`);
      if (r.images && r.images > 0) parts.push(`${r.images} images`);
      return parts.join(", ");
    }
    return `${r.fileName}: failed — ${r.error}`;
  });

  const succeeded = results.filter((r) => r.success).length;
  return `Processed ${succeeded}/${results.length} files:\n${lines.join("\n")}`;
}
