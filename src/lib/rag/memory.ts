import { prisma } from "@/lib/prisma";
import { getLogger } from "@/lib/logger";
import { ragClient } from "./client";
import { extractFromFile, extractFromBuffer, type ExtractedDocument, type ExtractOptions } from "./extractor";
import type { MemoryType } from "./types";

const log = getLogger("rag.memory");

/**
 * Two-tier memory system:
 * - Short-term: Recent conversation context (kept in DB, periodically summarized)
 * - Long-term: Important facts, preferences, learned info (stored in RAG)
 * - Episodic: Notable events and interactions (stored in RAG)
 */
export const memoryManager = {
  /**
   * Store a new memory, persisting both in the local DB and RAG knowledge graph.
   */
  async store(params: {
    userId: string;
    content: string;
    type?: MemoryType;
    tags?: string[];
    summary?: string;
  }): Promise<string> {
    const memoryType = params.type || "long_term";

    log.info("Storing memory", {
      userId: params.userId,
      type: memoryType,
      contentLength: params.content.length,
    });

    // Store in local database for quick access
    const memory = await prisma.memory.create({
      data: {
        userId: params.userId,
        type: memoryType,
        content: params.content,
        summary: params.summary,
        tags: params.tags ? JSON.stringify(params.tags) : null,
      },
    });

    log.debug("Memory created in DB", { memoryId: memory.id });

    // Store in RAG knowledge graph for semantic retrieval
    try {
      log.debug("Attempting RAG storage", { memoryId: memory.id });

      const ragResult = await ragClient.storeMemory({
        userId: params.userId,
        content: params.content,
        memoryType,
        tags: params.tags,
        metadata: {
          db_id: memory.id,
          ...(params.summary ? { summary: params.summary } : {}),
        },
      });

      // Update the memory with the RAG doc ID
      await prisma.memory.update({
        where: { id: memory.id },
        data: { ragDocId: ragResult.doc_id },
      });

      log.info("Memory stored successfully", {
        memoryId: memory.id,
        ragDocId: ragResult.doc_id,
      });
    } catch (error) {
      // RAG storage is best-effort; the DB record is the source of truth
      log.warn("Failed to store memory in RAG", {
        memoryId: memory.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return memory.id;
  },

  /**
   * Recall memories relevant to a query using the RAG knowledge graph.
   */
  async recall(params: {
    userId: string;
    query: string;
    type?: MemoryType;
    limit?: number;
  }): Promise<string> {
    log.info("Recalling memories", {
      userId: params.userId,
      queryLength: params.query.length,
      type: params.type,
    });

    try {
      const result = await ragClient.queryMemory({
        userId: params.userId,
        query: params.query,
        memoryType: params.type,
        topK: params.limit || 5,
      });

      log.debug("RAG recall succeeded", {
        userId: params.userId,
        resultLength: result.memories.length,
      });

      return result.memories;
    } catch (error) {
      log.warn("Failed to recall from RAG, falling back to DB", {
        userId: params.userId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to database search
      const memories = await prisma.memory.findMany({
        where: {
          userId: params.userId,
          ...(params.type ? { type: params.type } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: params.limit || 5,
      });

      log.debug("DB fallback recall completed", {
        userId: params.userId,
        resultCount: memories.length,
      });

      return memories.map((m) => m.content).join("\n\n---\n\n");
    }
  },

  /**
   * Get recent short-term memories for conversation context.
   */
  async getRecentContext(
    userId: string,
    limit: number = 10
  ): Promise<string[]> {
    log.debug("Getting recent context", { userId, limit });

    const memories = await prisma.memory.findMany({
      where: {
        userId,
        type: "short_term",
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    log.debug("Recent context retrieved", {
      userId,
      resultCount: memories.length,
    });

    return memories.map((m) => m.content);
  },

  /**
   * List all memories for a user with optional filtering.
   */
  async list(params: {
    userId: string;
    type?: MemoryType;
    limit?: number;
    offset?: number;
  }) {
    log.debug("Listing memories", {
      userId: params.userId,
      type: params.type,
      limit: params.limit,
      offset: params.offset,
    });

    const memories = await prisma.memory.findMany({
      where: {
        userId: params.userId,
        ...(params.type ? { type: params.type } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: params.limit || 20,
      skip: params.offset || 0,
    });

    const total = await prisma.memory.count({
      where: {
        userId: params.userId,
        ...(params.type ? { type: params.type } : {}),
      },
    });

    log.debug("Memories listed", {
      userId: params.userId,
      resultCount: memories.length,
      total,
    });

    return {
      memories: memories.map((m) => ({
        ...m,
        tags: m.tags ? JSON.parse(m.tags) : [],
      })),
      total,
    };
  },

  /**
   * Delete a specific memory.
   */
  async delete(memoryId: string, userId: string): Promise<void> {
    log.info("Deleting memory", { memoryId, userId });

    const memory = await prisma.memory.findFirst({
      where: { id: memoryId, userId },
    });

    if (!memory) throw new Error("Memory not found");

    // Remove from RAG if it has a doc ID
    if (memory.ragDocId) {
      try {
        log.debug("Deleting memory from RAG", {
          memoryId,
          ragDocId: memory.ragDocId,
        });

        await ragClient.deleteDocuments([memory.ragDocId]);
      } catch (error) {
        log.warn("Failed to delete memory from RAG", {
          memoryId,
          ragDocId: memory.ragDocId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await prisma.memory.delete({ where: { id: memoryId } });

    log.info("Memory deleted successfully", { memoryId, userId });
  },

  /**
   * Ingest a document into the knowledge base.
   */
  async ingestDocument(params: {
    userId: string;
    content: string;
    title?: string;
  }): Promise<string> {
    log.info("Ingesting document", {
      userId: params.userId,
      title: params.title,
    });

    const result = await ragClient.ingest({
      content: params.content,
      metadata: {
        user_id: params.userId,
        ...(params.title ? { title: params.title } : {}),
      },
    });

    log.info("Document ingested successfully", {
      userId: params.userId,
      docId: result.doc_id,
    });

    return result.doc_id;
  },

  /**
   * Extract content from a file on disk using kreuzberg-node, then ingest
   * the enriched content into the RAG knowledge graph.
   */
  async ingestFile(params: {
    userId: string;
    filePath: string;
    title?: string;
    extractOptions?: ExtractOptions;
  }): Promise<{ docId: string; extracted: ExtractedDocument }> {
    log.info("Ingesting file", {
      userId: params.userId,
      filePath: params.filePath,
      title: params.title,
    });

    log.debug("Extracting content from file", {
      filePath: params.filePath,
    });

    const extracted = await extractFromFile(params.filePath, params.extractOptions);
    const title = params.title || params.filePath.split("/").pop() || "Untitled";

    const result = await ragClient.ingest({
      content: extracted.enrichedContent,
      metadata: {
        user_id: params.userId,
        title,
        mime_type: extracted.mimeType,
        tables_count: String(extracted.tables.length),
        image_count: String(extracted.imageCount),
        ...(extracted.keywords.length > 0
          ? { keywords: extracted.keywords.join(", ") }
          : {}),
        ...(extracted.qualityScore != null
          ? { quality_score: String(extracted.qualityScore) }
          : {}),
      },
    });

    log.info("File ingested into RAG", {
      userId: params.userId,
      docId: result.doc_id,
      title,
    });

    log.debug("Creating memory record for ingested file", {
      userId: params.userId,
      title,
      ragDocId: result.doc_id,
    });

    // Also store a memory record for the file ingestion
    await prisma.memory.create({
      data: {
        userId: params.userId,
        type: "long_term",
        content: `Ingested document: ${title} (${extracted.mimeType}, ${extracted.content.length} chars, ${extracted.tables.length} tables, ${extracted.imageCount} images)`,
        summary: `Document "${title}" was added to the knowledge base.`,
        ragDocId: result.doc_id,
        tags: JSON.stringify(["document", "ingested", ...extracted.keywords.slice(0, 5)]),
      },
    });

    return { docId: result.doc_id, extracted };
  },

  /**
   * Extract content from a file buffer (e.g., uploaded file) using kreuzberg-node,
   * then ingest the enriched content into the RAG knowledge graph.
   */
  async ingestFileBuffer(params: {
    userId: string;
    buffer: Buffer;
    fileName: string;
    mimeType?: string;
    extractOptions?: ExtractOptions;
  }): Promise<{ docId: string; extracted: ExtractedDocument }> {
    log.info("Ingesting file buffer", {
      userId: params.userId,
      fileName: params.fileName,
      mimeType: params.mimeType,
    });

    log.debug("Extracting content from buffer", {
      fileName: params.fileName,
      mimeType: params.mimeType,
    });

    const extracted = await extractFromBuffer(
      params.buffer,
      params.mimeType,
      params.fileName,
      params.extractOptions,
    );
    const title = params.fileName;

    const result = await ragClient.ingest({
      content: extracted.enrichedContent,
      metadata: {
        user_id: params.userId,
        title,
        mime_type: extracted.mimeType,
        tables_count: String(extracted.tables.length),
        image_count: String(extracted.imageCount),
        ...(extracted.keywords.length > 0
          ? { keywords: extracted.keywords.join(", ") }
          : {}),
        ...(extracted.qualityScore != null
          ? { quality_score: String(extracted.qualityScore) }
          : {}),
      },
    });

    log.info("File buffer ingested into RAG", {
      userId: params.userId,
      docId: result.doc_id,
      fileName: params.fileName,
    });

    log.debug("Creating memory record for ingested file buffer", {
      userId: params.userId,
      title,
      ragDocId: result.doc_id,
    });

    // Also store a memory record for the file ingestion
    await prisma.memory.create({
      data: {
        userId: params.userId,
        type: "long_term",
        content: `Ingested document: ${title} (${extracted.mimeType}, ${extracted.content.length} chars, ${extracted.tables.length} tables, ${extracted.imageCount} images)`,
        summary: `Document "${title}" was added to the knowledge base.`,
        ragDocId: result.doc_id,
        tags: JSON.stringify(["document", "ingested", ...extracted.keywords.slice(0, 5)]),
      },
    });

    return { docId: result.doc_id, extracted };
  },
};
