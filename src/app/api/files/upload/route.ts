import { NextRequest } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { requireSession } from "@/lib/auth-server";
import { memoryManager } from "@/lib/rag/memory";
import { SUPPORTED_EXTENSIONS } from "@/lib/rag/extractor";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.files.upload");

const UPLOAD_DIR = join(process.cwd(), ".uploads");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * POST /api/files/upload
 * Upload a file, extract content with kreuzberg-node, and ingest into RAG.
 *
 * Accepts multipart/form-data with:
 * - file: The file to upload
 * - title: Optional title for the document
 * - enableOcr: Optional "true"/"false" to enable/disable OCR
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;
    const enableOcr = formData.get("enableOcr") !== "false";

    if (!file) {
      log.warn("File upload validation failed: no file provided");
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    log.info("File upload started", { fileName: file.name, fileSize: file.size });

    if (file.size > MAX_FILE_SIZE) {
      log.warn("File upload validation failed: file too large", {
        fileName: file.name,
        fileSize: file.size,
        maxSize: MAX_FILE_SIZE,
      });
      return Response.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Validate file extension
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      log.warn("File upload validation failed: unsupported file type", {
        fileName: file.name,
        extension: ext,
      });
      return Response.json(
        {
          error: `Unsupported file type: ${ext}. Supported formats: ${SUPPORTED_EXTENSIONS.slice(0, 20).join(", ")}...`,
        },
        { status: 400 }
      );
    }

    // Save file to disk temporarily
    await mkdir(UPLOAD_DIR, { recursive: true });
    const fileId = randomUUID();
    const filePath = join(UPLOAD_DIR, `${fileId}${ext}`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    log.debug("Writing file to disk", { filePath, fileId, fileSize: bytes.length });
    await writeFile(filePath, bytes);

    // Extract and ingest using kreuzberg-node
    log.info("Starting file extraction and ingestion", {
      fileName: file.name,
      fileId,
      enableOcr,
    });
    const { docId, extracted } = await memoryManager.ingestFile({
      userId,
      filePath,
      title: title || file.name,
      extractOptions: {
        enableOcr,
        extractTables: true,
        extractKeywords: true,
        enableQualityProcessing: true,
      },
    });

    // Clean up the temporary file (best-effort, non-blocking)
    unlink(filePath).catch(() => {});

    const durationMs = Date.now() - startTime;
    log.info("File upload completed successfully", {
      docId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: extracted.mimeType,
      contentLength: extracted.content.length,
      tableCount: extracted.tables.length,
      imageCount: extracted.imageCount,
      qualityScore: extracted.qualityScore,
      durationMs,
    });

    return Response.json({
      success: true,
      docId,
      fileName: file.name,
      mimeType: extracted.mimeType,
      contentLength: extracted.content.length,
      tables: extracted.tables.length,
      images: extracted.imageCount,
      keywords: extracted.keywords.slice(0, 20),
      qualityScore: extracted.qualityScore,
      warnings: extracted.warnings,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      log.warn("Unauthorized access to file upload");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    log.error("File upload error", { error, durationMs: Date.now() - startTime });
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to process file" },
      { status: 500 }
    );
  }
}
