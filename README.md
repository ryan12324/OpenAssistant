# OpenAssistant

A personal AI assistant with persistent memory powered by LightRAG and RAG-Anything. Inspired by [OpenClaw](https://openclaw.ai/), built with Next.js, TypeScript, and [Better Auth](https://www.better-auth.com/).

## Features

- **Persistent Memory**: Two-tier memory system (short-term + long-term) backed by a LightRAG knowledge graph
- **RAG-Anything Integration**: Multimodal document processing — ingest PDFs, images, tables, and more
- **Extensible Skills System**: Pluggable tools for memory, web search, calculations, and more
- **Secure Authentication**: Email/password + OAuth (GitHub, Google) via Better Auth
- **Streaming Chat**: Real-time AI responses with tool use via Vercel AI SDK
- **Memory Explorer**: Browse, search, and manage your assistant's knowledge
- **Dark UI**: Clean, responsive dashboard interface

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Next.js Frontend                   │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │
│  │   Chat   │ │  Memory  │ │ Skills │ │ Settings │ │
│  └──────────┘ └──────────┘ └────────┘ └──────────┘ │
├─────────────────────────────────────────────────────┤
│                   API Layer (Next.js)                │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │ Auth API │ │ Chat API │ │ Memory / Skills API│  │
│  └──────────┘ └──────────┘ └────────────────────┘  │
├──────────────────┬──────────────────────────────────┤
│   Better Auth    │         AI Agent                  │
│   + Prisma/SQLite│   ┌─────────────────────┐        │
│                  │   │  Vercel AI SDK       │        │
│                  │   │  + Skill Registry    │        │
│                  │   └─────────┬───────────┘        │
├──────────────────┴─────────────┼────────────────────┤
│              RAG Client (TypeScript)                 │
│                       │                              │
├───────────────────────┼──────────────────────────────┤
│          Python RAG Server (FastAPI)                 │
│  ┌─────────────────┐  ┌──────────────────────┐      │
│  │    LightRAG     │  │   RAG-Anything       │      │
│  │ (Knowledge Graph│  │ (Multimodal Docs)    │      │
│  │  + Vector Store)│  │                      │      │
│  └─────────────────┘  └──────────────────────┘      │
└─────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.10+
- An OpenAI API key (or compatible provider)

### 1. Install Dependencies

```bash
# Frontend
npm install

# RAG Server
cd rag-server
pip install -r requirements.txt
cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys:
#   BETTER_AUTH_SECRET (generate with: openssl rand -base64 32)
#   OPENAI_API_KEY
```

### 3. Set Up Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Run

```bash
# Terminal 1: Start the RAG server
cd rag-server && python server.py

# Terminal 2: Start Next.js
npm run dev

# Or run both together:
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000) and create an account.

### Docker

```bash
docker compose up --build
```

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── (auth)/              # Sign-in / Sign-up pages
│   │   ├── (dashboard)/         # Authenticated app pages
│   │   │   ├── chat/            # Chat interface
│   │   │   ├── memory/          # Memory explorer
│   │   │   ├── skills/          # Skills browser
│   │   │   └── settings/        # Settings & status
│   │   └── api/
│   │       ├── auth/[...all]/   # Better Auth handler
│   │       ├── chat/            # Streaming chat endpoint
│   │       ├── conversations/   # Conversation CRUD
│   │       ├── memory/          # Memory management
│   │       └── skills/          # Skills listing
│   ├── components/
│   │   ├── chat/                # Chat UI components
│   │   └── sidebar.tsx          # Navigation sidebar
│   └── lib/
│       ├── auth.ts              # Better Auth server config
│       ├── auth-client.ts       # Better Auth client
│       ├── ai/agent.ts          # AI agent with tool use
│       ├── rag/
│       │   ├── client.ts        # RAG server API client
│       │   ├── memory.ts        # Two-tier memory manager
│       │   └── types.ts         # TypeScript types
│       └── skills/
│           ├── registry.ts      # Skill registry
│           ├── types.ts         # Skill type definitions
│           └── builtin/         # Built-in skills
├── rag-server/                  # Python LightRAG server
│   ├── server.py                # FastAPI application
│   ├── config.py                # Server configuration
│   └── requirements.txt
├── prisma/schema.prisma         # Database schema
└── docker-compose.yml
```

## Skills

Built-in skills that the AI agent can use:

| Skill | Category | Description |
|-------|----------|-------------|
| `save_memory` | Memory | Store information to long-term knowledge graph |
| `recall_memory` | Memory | Search through stored memories via RAG |
| `ingest_document` | Memory | Add documents to the knowledge base |
| `web_search` | Web | Search the web for current information |
| `fetch_url` | Web | Fetch and read web page content |
| `get_current_time` | Productivity | Get current date/time in any timezone |
| `calculate` | Productivity | Evaluate mathematical expressions |
| `summarize_text` | Productivity | Summarize long text |

Add custom skills by creating a new file in `src/lib/skills/builtin/` and registering it in the registry.

## Memory System

The memory system uses a two-tier approach:

1. **Short-term memory**: Recent conversation context stored in SQLite, used for immediate recall
2. **Long-term memory**: Important facts, preferences, and learned information indexed into the LightRAG knowledge graph for semantic retrieval
3. **Episodic memory**: Notable events and interactions stored with temporal context

All memory queries go through the LightRAG hybrid retrieval (combining graph traversal + vector similarity) with a fallback to the local database.

## License

MIT
