# Code Review Report

## Table of Contents

1. [DRY Violations](#1-dry-violations)
2. [Hardcoded Configuration](#2-hardcoded-configuration)
3. [Code Smells & Wiring Issues](#3-code-smells--wiring-issues)
4. [Single Responsibility Violations](#4-single-responsibility-violations)

---

## 1. DRY Violations

### 1.1 Duplicated Error Handling Across All API Routes (HIGH)

**Files:** 15+ API route files (24 occurrences)
- `src/app/api/settings/route.ts` (lines 50-55, 118-123)
- `src/app/api/conversations/route.ts` (lines 31-36, 57-62)
- `src/app/api/conversations/[id]/route.ts` (lines 38-43)
- `src/app/api/skills/route.ts` (lines 23-26)
- `src/app/api/integrations/route.ts` (lines 54-59, 141-146)
- `src/app/api/mcp/route.ts` (lines 89-94, 190-195, 234-239)

**Pattern repeated 24 times:**
```typescript
} catch (error) {
  if (error instanceof Error && error.message === "Unauthorized") {
    log.warn("Unauthorized request to...");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  log.error("Failed to...", { error });
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
```

**Fix:** Extract into `src/lib/api-utils.ts`:
```typescript
export function handleApiError(error: unknown, context: string, log: Logger) {
  if (error instanceof Error && error.message === "Unauthorized") {
    log.warn(`Unauthorized request to ${context}`);
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  log.error(`Failed to ${context}`, { error });
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
```

---

### 1.2 Zod Schema Building from Parameters (HIGH)

**Files:**
- `src/lib/ai/agent.ts` (lines 56-70, 133-145, 217-245)
- `src/lib/agents/agent-node.ts` (lines 181-189, 210-218)

**Pattern repeated 5+ times:**
```typescript
const shape: Record<string, z.ZodTypeAny> = {};
for (const param of skill.parameters) {
  let schema: z.ZodTypeAny;
  switch (param.type) {
    case "number": schema = z.number().describe(param.description); break;
    case "boolean": schema = z.boolean().describe(param.description); break;
    default: schema = z.string().describe(param.description);
  }
  shape[param.name] = param.required ? schema : schema.optional();
}
```

**Fix:** Extract into `src/lib/schema-builder.ts` with a `buildZodSchemaFromParams()` utility.

---

### 1.3 Agent Hydration/Initialization (MEDIUM)

**Files:**
- `src/lib/ai/agent.ts` (lines 356-363 in `streamAgentResponse`, lines 415-421 in `generateAgentResponse`)

**Duplicated block:**
```typescript
await integrationRegistry.hydrateUserIntegrations(params.userId);
await mcpManager.hydrateUserConnections(params.userId);
await mcpManager.hydrateGlobalConnections();
const systemMessages = [{ role: "system", content: SYSTEM_PROMPT }];
if (params.memoryContext) { ... }
```

**Fix:** Extract into `initializeAgentContext(params)` helper.

---

### 1.4 Duplicate API Key Masking Logic (MEDIUM)

**Files:**
- `src/app/api/settings/route.ts` (lines 22-23) — inline `mask()` function
- `src/lib/logger.ts` (lines 46-50) — already exports `maskSecret`

**Fix:** Import and use `maskSecret` from `logger.ts` instead of reimplementing.

---

### 1.5 Tool Execution Wrapper Pattern (MEDIUM)

**Files:**
- `src/lib/ai/agent.ts` (lines 76-119, 151-199, 259-325)

**Pattern repeated 3 times** (skill, integration, MCP tools):
```typescript
const startMs = Date.now();
try {
  const result = await execute();
  const durationMs = Date.now() - startMs;
  log.info("tool completed", { ... });
  audit({ durationMs, success: true });
  return result;
} catch (err) {
  const durationMs = Date.now() - startMs;
  log.error("tool failed", { ... });
  audit({ durationMs, success: false });
}
```

**Fix:** Extract into `executeWithAudit(name, fn, auditData)` async wrapper.

---

### 1.6 Transcript/Results Collection in Team Orchestrator (LOW)

**File:** `src/lib/agents/team.ts` (lines 124-155, 175-209, 230-285, 304-334, 351-438)

**Repeated 8+ times** for pushing to transcript and agentResults arrays.

**Fix:** Extract `recordAgentExecution(transcript, agentResults, agent, result)` helper.

---

### 1.7 Agent Node Initialization (LOW)

**Files:**
- `src/lib/agents/team.ts` (lines 18-30)
- `src/lib/agents/router.ts` (lines 17-19)
- `src/lib/agents/swarm.ts` (lines 27-30)

**Fix:** Extract `initializeNodes(agents)` utility or base class method.

---

### 1.8 MCP Server Response Mapping (LOW)

**File:** `src/app/api/mcp/route.ts` (lines 35-79)

Nearly identical mapping logic for user servers and global servers.

**Fix:** Extract `mapServerToResponse(server, liveState)` utility.

---

## 2. Hardcoded Configuration

### 2.1 Provider Base URLs and Default Models (HIGH)

**File:** `src/lib/ai/providers.ts` (lines 50-124)

| Line | Hardcoded Value | Should Come From |
|------|----------------|------------------|
| 50 | `"https://api.openai.com/v1"` | DB per-provider base URL field |
| 51 | `"gpt-4o"` | DB default model per provider |
| 56 | `"claude-sonnet-4-5-20250929"` | DB default model |
| 95 | `"http://localhost:11434/v1"` | DB or env `OLLAMA_BASE_URL` |
| 100 | `"http://localhost:1234/v1"` | DB or env `LMSTUDIO_BASE_URL` |
| 166 | `"openai"` (default provider) | AppSettings |
| 198 | `"gpt-4o"` (fallback model) | AppSettings |

**Fix:** Store per-provider defaults in AppSettings with env var fallbacks. `PROVIDER_DEFAULTS` should be initial seeds, not runtime constants.

---

### 2.2 RAG Server URL (HIGH)

**Files:**
- `src/lib/rag/client.ts` (line 17): `"http://localhost:8020"`
- `src/app/api/health/route.ts` (line 6): `"http://localhost:8020"`

**Fix:** Add `ragServerUrl` to AppSettings with `RAG_SERVER_URL` env fallback.

---

### 2.3 Conversation Compaction Thresholds (MEDIUM)

**File:** `src/lib/compaction.ts` (lines 20-21)

| Constant | Value | Should Come From |
|----------|-------|------------------|
| `COMPACTION_THRESHOLD` | `80` | AppSettings `compactionThreshold` |
| `KEEP_RECENT` | `20` | AppSettings `compactionKeepRecent` |

---

### 2.4 AI Generation MaxSteps (MEDIUM)

| File | Line | Value | Recommended |
|------|------|-------|-------------|
| `src/lib/ai/agent.ts` | 389, 441 | `maxSteps: 10` | AppSettings `agentMaxSteps` |
| `src/lib/agents/agent-node.ts` | 45, 87 | `maxSteps: 8` | Agent definition or AppSettings |
| `src/lib/agents/team.ts` | 514 | `maxTokens: 4096` | AppSettings `synthesisMaxTokens` |
| `src/lib/agents/router.ts` | 144 | `maxTokens: 200` | AppSettings `routingMaxTokens` |

---

### 2.5 Timeout Values (MEDIUM)

| File | Line | Value | Recommended |
|------|------|-------|-------------|
| `src/lib/skills/builtin/web-skills.ts` | 74 | `10000` ms | AppSettings or env |
| `src/lib/integrations/tools/browser.ts` | 35 | `10000` ms | AppSettings or env |
| `src/lib/integrations/tools/webhooks.ts` | — | `10000` ms | AppSettings or env |
| `src/app/api/health/route.ts` | 12 | `3000` ms | env `HEALTH_CHECK_TIMEOUT` |
| `src/lib/agents/swarm.ts` | 39 | `60000` ms | SwarmDefinition config |

---

### 2.6 Embedding Model (MEDIUM)

**File:** `src/lib/settings.ts` (line 106)

`"text-embedding-3-small"` hardcoded as default embedding model.

**Fix:** Add `defaultEmbeddingModel` to AppSettings.

---

### 2.7 ElevenLabs API (LOW)

**File:** `src/lib/integrations/tools/voice.ts` (line 31)

- Hardcoded endpoint: `"https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM"`
- Hardcoded model: `"eleven_monolingual_v1"`
- Hardcoded voice ID in URL

**Fix:** Make voice ID and model configurable via integration config.

---

### 2.8 User-Agent Strings (LOW)

**Files:**
- `src/lib/skills/builtin/web-skills.ts` (line 73): `"OpenAssistant/0.1"`
- `src/lib/integrations/tools/browser.ts` (line 35): `"OpenAssistant/0.1"`

**Fix:** Read version from `package.json` or env.

---

### 2.9 Middleware Public Routes (LOW)

**File:** `src/middleware.ts` (line 12)

```typescript
const publicRoutes = ["/sign-in", "/sign-up", "/api/auth"];
```

**Fix:** Move to env or config file for different deployments.

---

### 2.10 Session Cookie Names (LOW)

**File:** `src/middleware.ts` (lines 32-33)

```typescript
"better-auth.session_token"
"__session"
```

**Fix:** Make configurable per auth implementation.

---

### 2.11 Content Truncation Limit (LOW)

**File:** `src/lib/skills/builtin/web-skills.ts` (line 101)

`.slice(0, 5000)` — 5000 char limit hardcoded.

**Fix:** Add to AppSettings `maxContentLength`.

---

### 2.12 Agent Preset Temperatures (LOW)

**File:** `src/lib/agents/presets.ts` (lines 29-264)

Multiple hardcoded temperature values (0.1 to 0.9) across 8+ agent presets.

**Fix:** Make temperatures configurable per agent via database.

---

## 3. Code Smells & Wiring Issues

### 3.1 Unhandled Promise in Fire-and-Forget (HIGH)

**File:** `src/app/api/chat/route.ts` (line 118)

```typescript
result.text.then(async (text) => { ... })
```

No `.catch()` handler. Failures in message persistence, memory storage, and compaction are silently swallowed.

**Fix:** Add `.catch()` or use `void` with explicit error logging:
```typescript
result.text.then(async (text) => { ... }).catch((err) => {
  log.error("Post-stream processing failed", { error: err });
});
```

---

### 3.2 Excessive `as any` / `as unknown` Type Casts (MEDIUM)

**File:** `src/lib/integrations/registry.ts` (lines 280-346)

67 instances of `as unknown as InstanceConstructor` bypassing type safety.

**Fix:** Create proper generic type constraints or use a type-safe factory pattern.

---

### 3.3 Loose `any[]` Type on Messages (MEDIUM)

**File:** `src/app/api/chat/route.ts` (line 27)

```typescript
messages: any[]
```

**Fix:** Define a `UserMessage` interface and use proper typing.

---

### 3.4 Non-Null Assertions Without Runtime Checks (MEDIUM)

**File:** `src/app/api/chat/route.ts` (lines 130, 187, 202)

Using `convId!` after conditional logic.

**Fix:** Refactor control flow to narrow types properly.

---

### 3.5 Silent Error Swallowing in Registry Hydration (MEDIUM)

**File:** `src/lib/integrations/registry.ts` (lines 204-216)

Integration hydration errors are only logged as warnings — users won't know integrations failed to load.

**Fix:** Return status objects indicating which integrations failed.

---

### 3.6 Global Queue State Without Synchronization (MEDIUM)

**File:** `src/lib/queue.ts` (lines 141-142)

Global `handler` and `polling` variables without synchronization primitives. Potential race conditions.

**Fix:** Add initialization guards and async locks.

---

### 3.7 Worker Initialization Not Properly Guarded (MEDIUM)

**File:** `src/instrumentation.ts` (lines 7-16)

`initWorker()` called without awaiting async initialization. Subsequent requests may arrive before handlers are ready.

**Fix:** Await initialization or implement a ready-state check.

---

### 3.8 PrismaClient Singleton Inconsistency (MEDIUM)

**File:** `src/lib/prisma.ts` (lines 17-19)

Cached on `globalThis` in development but not in production. Could cause multiple instances in production.

**Fix:** Cache consistently across all environments.

---

### 3.9 Missing Return Types on Public Functions (MEDIUM)

| File | Line | Function |
|------|------|----------|
| `src/lib/settings.ts` | 80 | `getEffectiveAIConfig()` |
| `src/lib/ai/providers.ts` | 248 | `getProviderList()` |

**Fix:** Add explicit return type annotations.

---

### 3.10 RAG Client Response Validation (LOW)

**File:** `src/lib/rag/client.ts` (line 45)

`ragFetch<T>()` casts `res.json()` to `Promise<T>` without runtime validation.

**Fix:** Add Zod runtime validation for external API responses.

---

### 3.11 Overly Complex API Key Resolution (LOW)

**File:** `src/lib/settings.ts` (lines 88-92)

Nested ternary operations for key resolution.

**Fix:** Extract into `resolveApiKey(provider, settings)` helper.

---

### 3.12 Missing Error Context in Audit Logging (LOW)

**File:** `src/lib/audit.ts` (line 68)

`.catch()` swallows errors without context about which action/user/skill failed.

**Fix:** Log audit failures with full context.

---

### 3.13 Inconsistent Error Status Codes (LOW)

**Files:** All API routes

Routes return generic 500 errors without distinguishing between validation errors (400), service unavailable (503), etc.

**Fix:** Return specific HTTP status codes with descriptive error bodies.

---

### 3.14 resolveModel() Mixes Validation and Creation (LOW)

**File:** `src/lib/ai/providers.ts` (lines 148-154)

`resolveModel()` both validates configuration AND creates a client instance.

**Fix:** Separate into `validateModelConfig()` and `createModelClient()`.

---

## 4. Single Responsibility Violations

### 4.1 Chat Route — God Handler (HIGH)

**File:** `src/app/api/chat/route.ts` (lines 13-232)

**Mixed responsibilities:**
- HTTP request handling
- Conversation management (create/get)
- Message persistence
- AI/agent orchestration
- Memory management (recall + store)
- Title generation
- Conversation compaction
- Response streaming

**Fix:** Create a service layer:
- `ConversationService` for CRUD
- `ChatOrchestrator` for coordinating AI, memory, and compaction
- Route handler only does HTTP concerns

---

### 4.2 buildTools() — Triple Registration System (HIGH)

**File:** `src/lib/ai/agent.ts` (lines 46-333)

**Mixed responsibilities:**
- Built-in skill tool registration
- Integration tool registration
- MCP tool registration
- Zod schema generation
- Tool execution wrapping
- Audit logging

**Fix:** Split into `BuiltInToolRegistry`, `IntegrationToolRegistry`, `MCPToolRegistry`, and a shared `ToolSchemaBuilder`.

---

### 4.3 memoryManager — CRUD + RAG + Ingestion (HIGH)

**File:** `src/lib/rag/memory.ts` (lines 15-415)

**Mixed responsibilities:**
- Memory CRUD
- RAG client coordination with fallback logic
- Document extraction (ingestFile, ingestFileBuffer)
- File buffer handling
- Metadata transformation

**Fix:** Split into `MemoryRepository`, `RAGIntegration`, and `DocumentIngestionService`.

---

### 4.4 Middleware — Auth + Routing + Logging (HIGH)

**File:** `src/middleware.ts` (lines 14-48)

**Mixed responsibilities:**
- Route classification (public vs protected)
- Authentication checking
- Session management
- Redirect logic for pages vs API authorization

**Fix:** Separate into `RouteClassifier`, `AuthMiddleware`, and `ResponseHandler`.

---

### 4.5 getEffectiveAIConfig() — LLM + Embedding Resolution (MEDIUM)

**File:** `src/lib/settings.ts` (lines 76-146)

Resolves both LLM config AND embedding config with interleaved env fallback logic.

**Fix:** Split into `resolveLLMConfig()` and `resolveEmbeddingConfig()`.

---

### 4.6 IntegrationRegistry — Registry + Lifecycle + Cache (MEDIUM)

**File:** `src/lib/integrations/registry.ts` (lines 84-347)

**Mixed responsibilities:**
- Definition registration/lookup
- Instance creation/management
- Database hydration
- User vs global scope management
- Connection state tracking
- Cache invalidation

**Fix:** Facade pattern — `IntegrationRegistry` (lookup), `IntegrationLifecycle` (instances), `IntegrationHydration` (DB loading).

---

### 4.7 McpClientManager — Connections + Discovery + Hydration (MEDIUM)

**File:** `src/lib/mcp/client.ts` (lines 20-335)

**Mixed responsibilities:**
- Server connection/disconnection
- Tool discovery and caching
- Tool invocation
- User/global filtering
- Database hydration

**Fix:** Split into `McpConnectionManager`, `McpToolDiscovery`, `McpHydrationService`.

---

### 4.8 Compaction — Threshold + Summary + Persistence + Memory (MEDIUM)

**File:** `src/lib/compaction.ts` (lines 27-188)

**Mixed responsibilities:**
- Eligibility checking
- LLM summarization
- Message DB persistence (create/delete)
- RAG memory storage

**Fix:** Split into `CompactionChecker`, `ConversationSummarizer`, `CompactionPersistence`.

---

### 4.9 MCP Route — Listing + CRUD + Hydration + Formatting (MEDIUM)

**File:** `src/app/api/mcp/route.ts` (lines 16-241)

Route handler does server listing, config CRUD, live state merging, and response formatting.

**Fix:** Create `MCPServerService` for business logic, keep route handler thin.

---

### 4.10 processInboundMessage() — Full Pipeline (MEDIUM)

**File:** `src/lib/worker.ts` (lines 28-168)

Single function handles the entire message pipeline: conversation resolution, message persistence, memory recall, AI generation, memory storage, compaction, and audit logging.

**Fix:** Break into composable pipeline stages with a `MessagePipeline` orchestrator.

---

## Summary

| Category | High | Medium | Low | Total |
|----------|------|--------|-----|-------|
| DRY Violations | 2 | 3 | 3 | **8** |
| Hardcoded Config | 2 | 4 | 6 | **12** |
| Code Smells | 1 | 7 | 5 | **13** |
| SRP Violations | 4 | 6 | 0 | **10** |
| **Total** | **9** | **20** | **14** | **43** |

### Top Priority Fixes

1. **Extract API error handler** — eliminates 24 duplicate blocks across 15 files
2. **Add `.catch()` to fire-and-forget promise** in `chat/route.ts` — silent data loss risk
3. **Move compaction thresholds and maxSteps to AppSettings** — most impactful config externalization
4. **Extract Zod schema builder** — eliminates 5+ duplicate schema conversion blocks
5. **Create service layer for chat route** — largest SRP violation, 250+ lines
6. **Split buildTools()** into separate registries — 287 lines doing 3 distinct systems
7. **Use existing `maskSecret`** from logger.ts instead of reimplementing
8. **Extract hydration initialization** — duplicated in both stream and generate paths
9. **Add RAG server URL to AppSettings** — duplicated hardcoded localhost in 2 files
