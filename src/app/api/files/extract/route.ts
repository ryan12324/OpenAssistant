import { NextRequest } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { requireSession } from "@/lib/auth-server";
import { extractFromFile, SUPPORTED_EXTENSIONS } from "@/lib/rag/extractor";

const UPLOAD_DIR = join(process.cwd(), ".uploads");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * POST /api/files/extract
 * Extract content from a file using kreuzberg-node without ingesting into RAG.
 * Useful for previewing extraction results or using the content in chat.
 */
export async function POST(req: NextRequest) {
  try {
    await requireSession();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const enableOcr = formData.get("enableOcr") !== "false";

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return Response.json(
        { error: `Unsupported file type: ${ext}` },
        { status: 400 }
      );
    }

    // Save to temp, extract, clean up
    await mkdir(UPLOAD_DIR, { recursive: true });
    const fileId = randomUUID();
    const filePath = join(UPLOAD_DIR, `${fileId}${ext}`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await writeFile(filePath, bytes);

    try {
      const extracted = await extractFromFile(filePath, {
        enableOcr,
        extractTables: true,
        extractKeywords: true,
        enableQualityProcessing: true,
      });

      return Response.json({
        success: true,
        fileName: file.name,
        mimeType: extracted.mimeType,
        content: extracted.content,
        enrichedContent: extracted.enrichedContent,
        tables: extracted.tables,
        imageCount: extracted.imageCount,
        keywords: extracted.keywords,
        elements: extracted.elements.slice(0, 50),
        qualityScore: extracted.qualityScore,
        warnings: extracted.warnings,
      });
    } finally {
      await unlink(filePath).catch(() => {});
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("File extraction error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to extract file" },
      { status: 500 }
    );
  }
}
