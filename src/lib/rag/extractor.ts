import {
  extractFile,
  extractBytes,
  batchExtractFiles,
  detectMimeTypeFromPath,
  type ExtractionResult,
  type ExtractionConfig,
} from "@kreuzberg/node";

/**
 * Processed document output ready for RAG ingestion.
 */
export interface ExtractedDocument {
  /** Full extracted text content */
  content: string;
  /** MIME type of the source file */
  mimeType: string;
  /** Extracted tables in markdown format */
  tables: string[];
  /** Number of images found */
  imageCount: number;
  /** Extracted keywords */
  keywords: string[];
  /** Structured elements (headings, paragraphs, etc.) */
  elements: { type: string; text: string }[];
  /** Extraction quality score (0-1) if available */
  qualityScore?: number;
  /** Any warnings from extraction */
  warnings: string[];
  /** Combined enriched text for RAG (includes tables and metadata) */
  enrichedContent: string;
}

/** Options for document extraction. */
export interface ExtractOptions {
  /** Enable OCR for scanned documents/images */
  enableOcr?: boolean;
  /** OCR language codes (e.g., "eng", "eng+fra") */
  ocrLanguage?: string;
  /** Enable table extraction */
  extractTables?: boolean;
  /** Enable keyword extraction */
  extractKeywords?: boolean;
  /** Enable quality scoring */
  enableQualityProcessing?: boolean;
}

const DEFAULT_OPTIONS: ExtractOptions = {
  enableOcr: true,
  ocrLanguage: "eng",
  extractTables: true,
  extractKeywords: true,
  enableQualityProcessing: true,
};

/**
 * Build the kreuzberg ExtractionConfig from our simplified options.
 */
function buildConfig(options: ExtractOptions): ExtractionConfig {
  const config: ExtractionConfig = {};

  if (options.enableOcr) {
    config.ocr = {
      backend: "tesseract",
      language: options.ocrLanguage || "eng",
    };
  }

  if (options.enableQualityProcessing) {
    config.enableQualityProcessing = true;
  }

  return config;
}

/**
 * Convert a kreuzberg ExtractionResult into our enriched document format.
 * The enriched content combines text, tables, and metadata into a single
 * string optimized for RAG ingestion.
 */
function processResult(
  result: ExtractionResult,
  fileName?: string,
): ExtractedDocument {
  const tables = (result.tables || []).map(
    (t) => t.markdown || t.cells?.map((row) => row.join(" | ")).join("\n") || ""
  );

  const elements = (result.elements || []).map((el) => ({
    type: el.elementType || "unknown",
    text: el.text || "",
  }));

  const keywords = (result.extractedKeywords || []).map((k) => k.text);
  const imageCount = result.images?.length || 0;
  const warnings = (result.processingWarnings || []).map((w) => `${w.source}: ${w.message}`);

  // Build enriched content for RAG ingestion
  let enriched = "";

  // Add file metadata header
  if (fileName) {
    enriched += `[Document: ${fileName}]\n`;
  }
  if (result.mimeType) {
    enriched += `[Type: ${result.mimeType}]\n`;
  }
  if (keywords.length > 0) {
    enriched += `[Keywords: ${keywords.join(", ")}]\n`;
  }
  if (imageCount > 0) {
    enriched += `[Images: ${imageCount}]\n`;
  }
  enriched += "\n";

  // Main text content
  enriched += result.content || "";

  // Append tables as markdown sections
  if (tables.length > 0) {
    enriched += "\n\n---\n\n## Extracted Tables\n\n";
    tables.forEach((table, i) => {
      enriched += `### Table ${i + 1}\n\n${table}\n\n`;
    });
  }

  return {
    content: result.content || "",
    mimeType: result.mimeType || "application/octet-stream",
    tables,
    imageCount,
    keywords,
    elements,
    qualityScore: result.qualityScore ?? undefined,
    warnings,
    enrichedContent: enriched,
  };
}

/**
 * Extract content from a file on disk.
 */
export async function extractFromFile(
  filePath: string,
  options?: ExtractOptions,
): Promise<ExtractedDocument> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const config = buildConfig(opts);
  const result = await extractFile(filePath, null, config);
  const fileName = filePath.split("/").pop() || filePath;
  return processResult(result, fileName);
}

/**
 * Extract content from a buffer (e.g., uploaded file bytes).
 */
export async function extractFromBuffer(
  buffer: Buffer,
  mimeType?: string,
  fileName?: string,
  options?: ExtractOptions,
): Promise<ExtractedDocument> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const config = buildConfig(opts);
  const result = await extractBytes(buffer, mimeType || "application/octet-stream", config);
  return processResult(result, fileName);
}

/**
 * Extract content from multiple files in parallel (batch).
 */
export async function extractBatch(
  filePaths: string[],
  options?: ExtractOptions,
): Promise<ExtractedDocument[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const config = buildConfig(opts);
  const results = await batchExtractFiles(filePaths, config);
  return results.map((result, i) => {
    const fileName = filePaths[i]?.split("/").pop() || filePaths[i];
    return processResult(result, fileName);
  });
}

/**
 * Detect the MIME type of a file by its path/extension.
 */
export function detectMimeType(filePath: string): string | null {
  try {
    return detectMimeTypeFromPath(filePath);
  } catch {
    return null;
  }
}

/**
 * List of file extensions supported by kreuzberg for extraction.
 */
export const SUPPORTED_EXTENSIONS = [
  // Documents
  ".pdf", ".docx", ".doc", ".odt", ".rtf",
  // Spreadsheets
  ".xlsx", ".xlsm", ".xlsb", ".xls", ".ods", ".csv", ".tsv",
  // Presentations
  ".pptx", ".ppt", ".pptm", ".ppsx",
  // Images (OCR)
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".svg",
  // Web/Markup
  ".html", ".htm", ".xhtml", ".xml",
  // Data
  ".json", ".yaml", ".yml", ".toml",
  // Text
  ".txt", ".md", ".markdown", ".rst",
  // Academic
  ".tex", ".typ", ".bib", ".ris", ".ipynb",
  // eBooks
  ".epub", ".fb2",
  // Email
  ".eml", ".msg",
  // Archives
  ".zip", ".tar", ".tgz", ".gz", ".7z",
];

/**
 * MIME types accepted for file upload.
 */
export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
  "application/yaml",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/epub+zip",
  "message/rfc822",
  "application/zip",
  "application/gzip",
];
