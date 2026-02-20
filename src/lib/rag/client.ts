import type {
  IngestRequest,
  IngestResponse,
  QueryRequest,
  QueryResponse,
  MemoryStoreRequest,
  MemoryStoreResponse,
  MemoryQueryRequest,
  MemoryQueryResponse,
  RAGHealthResponse,
} from "./types";

const RAG_SERVER_URL =
  process.env.RAG_SERVER_URL || "http://localhost:8020";
const RAG_API_KEY = process.env.RAG_API_KEY || "";

async function ragFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(RAG_API_KEY ? { Authorization: `Bearer ${RAG_API_KEY}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${RAG_SERVER_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`RAG server error (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
}

export const ragClient = {
  /** Check RAG server health */
  async health(): Promise<RAGHealthResponse> {
    return ragFetch<RAGHealthResponse>("/health");
  },

  /** Ingest text content into the knowledge graph */
  async ingest(req: IngestRequest): Promise<IngestResponse> {
    return ragFetch<IngestResponse>("/ingest", {
      method: "POST",
      body: JSON.stringify({
        content: req.content,
        doc_id: req.docId,
        metadata: req.metadata,
      }),
    });
  },

  /** Query the knowledge graph */
  async query(req: QueryRequest): Promise<QueryResponse> {
    return ragFetch<QueryResponse>("/query", {
      method: "POST",
      body: JSON.stringify({
        query: req.query,
        mode: req.mode || "hybrid",
        top_k: req.topK || 5,
        user_id: req.userId,
      }),
    });
  },

  /** Store a memory */
  async storeMemory(req: MemoryStoreRequest): Promise<MemoryStoreResponse> {
    return ragFetch<MemoryStoreResponse>("/memory/store", {
      method: "POST",
      body: JSON.stringify({
        user_id: req.userId,
        content: req.content,
        memory_type: req.memoryType || "long_term",
        tags: req.tags,
        metadata: req.metadata,
      }),
    });
  },

  /** Query memories for a user */
  async queryMemory(req: MemoryQueryRequest): Promise<MemoryQueryResponse> {
    return ragFetch<MemoryQueryResponse>("/memory/query", {
      method: "POST",
      body: JSON.stringify({
        user_id: req.userId,
        query: req.query,
        memory_type: req.memoryType,
        top_k: req.topK || 5,
      }),
    });
  },

  /** Delete documents from the RAG store */
  async deleteDocuments(docIds: string[]): Promise<{ status: string }> {
    return ragFetch("/delete", {
      method: "POST",
      body: JSON.stringify({ doc_ids: docIds }),
    });
  },

  /** Get knowledge graph statistics */
  async graphStats(): Promise<Record<string, unknown>> {
    return ragFetch("/graph/stats");
  },
};
