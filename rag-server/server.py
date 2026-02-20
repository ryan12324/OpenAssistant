"""
OpenAssistant RAG Server
Wraps LightRAG and RAG-Anything to provide a REST API for the Next.js frontend.
Handles document ingestion, memory storage, and intelligent retrieval.
"""

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import (
    LLM_MODEL,
    LLM_API_KEY,
    LLM_BASE_URL,
    EMBEDDING_MODEL,
    EMBEDDING_DIM,
    HOST,
    PORT,
    API_KEY,
    WORKING_DIR,
)

# ─── LightRAG Setup ──────────────────────────────────────────

rag_instance = None


async def get_rag():
    """Lazy-initialize the LightRAG instance."""
    global rag_instance
    if rag_instance is not None:
        return rag_instance

    try:
        from functools import partial
        from lightrag import LightRAG, QueryParam
        from lightrag.llm.openai import openai_complete, openai_embed
        from lightrag.utils import EmbeddingFunc

        os.makedirs(WORKING_DIR, exist_ok=True)

        rag_instance = LightRAG(
            working_dir=WORKING_DIR,
            llm_model_func=openai_complete,
            llm_model_name=LLM_MODEL,
            llm_model_kwargs={
                "api_key": LLM_API_KEY,
                "base_url": LLM_BASE_URL,
            },
            embedding_func=EmbeddingFunc(
                embedding_dim=EMBEDDING_DIM,
                func=partial(
                    openai_embed.func,
                    model=EMBEDDING_MODEL,
                    api_key=LLM_API_KEY,
                    base_url=LLM_BASE_URL,
                ),
            ),
        )
        return rag_instance
    except ImportError:
        print(
            "WARNING: LightRAG not installed. Running in mock mode. "
            "Install with: pip install lightrag-hku"
        )
        return None


# ─── RAG-Anything Setup ──────────────────────────────────────

rag_anything_instance = None


async def get_rag_anything():
    """Lazy-initialize RAG-Anything for multimodal document processing."""
    global rag_anything_instance
    if rag_anything_instance is not None:
        return rag_anything_instance

    try:
        from raganything import RAGAnything

        rag_anything_instance = RAGAnything(
            lightrag=await get_rag(),
        )
        return rag_anything_instance
    except ImportError:
        print(
            "WARNING: RAG-Anything not installed. Multimodal features disabled. "
            "Install with: pip install raganything"
        )
        return None


# ─── API Models ───────────────────────────────────────────────


class IngestRequest(BaseModel):
    content: str
    doc_id: Optional[str] = None
    metadata: Optional[dict] = None


class IngestFileRequest(BaseModel):
    file_path: str
    doc_id: Optional[str] = None
    metadata: Optional[dict] = None


class QueryRequest(BaseModel):
    query: str
    mode: str = Field(default="hybrid", pattern="^(local|global|hybrid|naive|mix)$")
    top_k: int = Field(default=5, ge=1, le=50)
    user_id: Optional[str] = None


class MemoryStoreRequest(BaseModel):
    user_id: str
    content: str
    memory_type: str = Field(
        default="long_term", pattern="^(short_term|long_term|episodic)$"
    )
    tags: Optional[list[str]] = None
    metadata: Optional[dict] = None


class MemoryQueryRequest(BaseModel):
    user_id: str
    query: str
    memory_type: Optional[str] = None
    top_k: int = Field(default=5, ge=1, le=20)


class DeleteRequest(BaseModel):
    doc_ids: list[str]


# ─── Auth Dependency ─────────────────────────────────────────


async def verify_api_key(authorization: Optional[str] = Header(None)):
    if not API_KEY:
        return  # No auth required if API_KEY not set
    if not authorization or authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid API key")


# ─── App Setup ────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize RAG on startup."""
    await get_rag()
    yield
    # Cleanup
    global rag_instance
    if rag_instance:
        try:
            await rag_instance.finalize_storages()
        except Exception:
            pass


app = FastAPI(
    title="OpenAssistant RAG Server",
    description="LightRAG + RAG-Anything memory backend for OpenAssistant",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health ───────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "lightrag": rag_instance is not None,
        "rag_anything": rag_anything_instance is not None,
    }


# ─── Document Ingestion ──────────────────────────────────────


@app.post("/ingest", dependencies=[Depends(verify_api_key)])
async def ingest_text(req: IngestRequest):
    """Ingest text content into the RAG knowledge graph."""
    rag = await get_rag()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG engine not available")

    doc_id = req.doc_id or str(uuid.uuid4())

    try:
        # Prepend metadata as context if provided
        content = req.content
        if req.metadata:
            meta_str = "\n".join(f"{k}: {v}" for k, v in req.metadata.items())
            content = f"[Document ID: {doc_id}]\n[Metadata]\n{meta_str}\n\n{content}"

        await rag.ainsert(content)
        return {"status": "ok", "doc_id": doc_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/file", dependencies=[Depends(verify_api_key)])
async def ingest_file(req: IngestFileRequest):
    """Ingest a file using RAG-Anything for multimodal processing."""
    rag_any = await get_rag_anything()
    if not rag_any:
        # Fallback to text-only ingestion
        rag = await get_rag()
        if not rag:
            raise HTTPException(status_code=503, detail="RAG engine not available")

        try:
            with open(req.file_path, "r") as f:
                content = f.read()
            await rag.ainsert(content)
            return {"status": "ok", "doc_id": req.doc_id or str(uuid.uuid4()), "mode": "text_only"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    doc_id = req.doc_id or str(uuid.uuid4())

    try:
        await rag_any.process_document(
            file_path=req.file_path,
            doc_id=doc_id,
        )
        return {"status": "ok", "doc_id": doc_id, "mode": "multimodal"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Query ────────────────────────────────────────────────────


@app.post("/query", dependencies=[Depends(verify_api_key)])
async def query(req: QueryRequest):
    """Query the RAG knowledge graph."""
    rag = await get_rag()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG engine not available")

    try:
        from lightrag import QueryParam

        # Build query with user context if provided
        query_text = req.query
        if req.user_id:
            query_text = f"[User: {req.user_id}] {query_text}"

        result = await rag.aquery(
            query_text,
            param=QueryParam(mode=req.mode, top_k=req.top_k),
        )

        return {
            "status": "ok",
            "result": result,
            "mode": req.mode,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Memory Management ───────────────────────────────────────


@app.post("/memory/store", dependencies=[Depends(verify_api_key)])
async def store_memory(req: MemoryStoreRequest):
    """Store a memory entry into the RAG system with user-scoped context."""
    rag = await get_rag()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG engine not available")

    doc_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().isoformat()

    try:
        # Format memory with structured metadata for the knowledge graph
        memory_doc = (
            f"[Memory Entry: {doc_id}]\n"
            f"[User: {req.user_id}]\n"
            f"[Type: {req.memory_type}]\n"
            f"[Timestamp: {timestamp}]\n"
        )
        if req.tags:
            memory_doc += f"[Tags: {', '.join(req.tags)}]\n"
        if req.metadata:
            meta_str = "\n".join(f"[{k}: {v}]" for k, v in req.metadata.items())
            memory_doc += f"{meta_str}\n"

        memory_doc += f"\n{req.content}"

        await rag.ainsert(memory_doc)

        return {
            "status": "ok",
            "doc_id": doc_id,
            "memory_type": req.memory_type,
            "timestamp": timestamp,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/memory/query", dependencies=[Depends(verify_api_key)])
async def query_memory(req: MemoryQueryRequest):
    """Query memories for a specific user."""
    rag = await get_rag()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG engine not available")

    try:
        from lightrag import QueryParam

        # Scope query to user
        scoped_query = f"[User: {req.user_id}]"
        if req.memory_type:
            scoped_query += f" [Type: {req.memory_type}]"
        scoped_query += f" {req.query}"

        result = await rag.aquery(
            scoped_query,
            param=QueryParam(mode="hybrid", top_k=req.top_k),
        )

        return {
            "status": "ok",
            "memories": result,
            "query": req.query,
            "user_id": req.user_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Delete ───────────────────────────────────────────────────


@app.post("/delete", dependencies=[Depends(verify_api_key)])
async def delete_documents(req: DeleteRequest):
    """Delete documents from the RAG store."""
    rag = await get_rag()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG engine not available")

    try:
        await rag.adelete_by_doc_id(req.doc_ids)
        return {"status": "ok", "deleted": req.doc_ids}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Graph Info ───────────────────────────────────────────────


@app.get("/graph/stats", dependencies=[Depends(verify_api_key)])
async def graph_stats():
    """Get knowledge graph statistics."""
    rag = await get_rag()
    if not rag:
        raise HTTPException(status_code=503, detail="RAG engine not available")

    try:
        # Get basic stats from the knowledge graph
        return {
            "status": "ok",
            "working_dir": WORKING_DIR,
            "model": LLM_MODEL,
            "embedding_model": EMBEDDING_MODEL,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Main ─────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Starting OpenAssistant RAG Server on {HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT)
