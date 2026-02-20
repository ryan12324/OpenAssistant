import { prisma } from "@/lib/prisma";
import { ragClient } from "./client";
import { extractFromFile, extractFromBuffer, type ExtractedDocument, type ExtractOptions } from "./extractor";
import type { MemoryType } from "./types";

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

    // Store in RAG knowledge graph for semantic retrieval
    try {
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
    } catch (error) {
      // RAG storage is best-effort; the DB record is the source of truth
      console.error("Failed to store memory in RAG:", error);
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
    try {
      const result = await ragClient.queryMemory({
        userId: params.userId,
        query: params.query,
        memoryType: params.type,
        topK: params.limit || 5,
      });
      return result.memories;
    } catch (error) {
      console.error("Failed to recall from RAG, falling back to DB:", error);
      // Fallback to database search
      const memories = await prisma.memory.findMany({
        where: {
          userId: params.userId,
          ...(params.type ? { type: params.type } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: params.limit || 5,
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
    const memories = await prisma.memory.findMany({
      where: {
        userId,
        type: "short_term",
      },
      orderBy: { createdAt: "desc" },
      take: limit,
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
    const memory = await prisma.memory.findFirst({
      where: { id: memoryId, userId },
    });

    if (!memory) throw new Error("Memory not found");

    // Remove from RAG if it has a doc ID
    if (memory.ragDocId) {
      try {
        await ragClient.deleteDocuments([memory.ragDocId]);
      } catch (error) {
        console.error("Failed to delete from RAG:", error);
      }
    }

    await prisma.memory.delete({ where: { id: memoryId } });
  },

  /**
   * Ingest a document into the knowledge base.
   */
  async ingestDocument(params: {
    userId: string;
    content: string;
    title?: string;
  }): Promise<string> {
    const result = await ragClient.ingest({
      content: params.content,
      metadata: {
        user_id: params.userId,
        ...(params.title ? { title: params.title } : {}),
      },
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
