export type QueryMode = "local" | "global" | "hybrid" | "naive" | "mix";

export type MemoryType = "short_term" | "long_term" | "episodic";

export interface IngestRequest {
  content: string;
  docId?: string;
  metadata?: Record<string, string>;
}

export interface IngestResponse {
  status: string;
  doc_id: string;
}

export interface QueryRequest {
  query: string;
  mode?: QueryMode;
  topK?: number;
  userId?: string;
}

export interface QueryResponse {
  status: string;
  result: string;
  mode: QueryMode;
}

export interface MemoryStoreRequest {
  userId: string;
  content: string;
  memoryType?: MemoryType;
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface MemoryStoreResponse {
  status: string;
  doc_id: string;
  memory_type: MemoryType;
  timestamp: string;
}

export interface MemoryQueryRequest {
  userId: string;
  query: string;
  memoryType?: MemoryType;
  topK?: number;
}

export interface MemoryQueryResponse {
  status: string;
  memories: string;
  query: string;
  user_id: string;
}

export interface RAGHealthResponse {
  status: string;
  lightrag: boolean;
  rag_anything: boolean;
}
