# AGENTS.md — Development Guidelines

## Architecture Overview

- **Next.js 15 App Router** with API routes under `src/app/api/`
- **Vercel AI SDK** (`ai` package) for streaming (`streamText`) and generation (`generateText`)
- **OpenAI-compatible routing** — all providers go through `createOpenAI` with custom `baseURL`
- **Prisma ORM** with SQLite for persistence
- **Better Auth** for authentication (session cookies, not JWT)
- **SQLite-backed job queue** (Gateway Pattern) — no Redis/RabbitMQ needed
- **LightRAG** (Python FastAPI server) for semantic memory / knowledge graph
- **MCP** (Model Context Protocol) for external tool discovery
- **Edge Runtime** in `middleware.ts` — cannot import Node-only modules

---

## Known Antipatterns

### 1. Do NOT parse provider names from model strings

**Bad:** Splitting a model string on `/` to extract a provider prefix.

```typescript
// WRONG — Do not do this
function parseModelString(model: string) {
  const parts = model.split("/");
  if (parts.length >= 2) {
    return { provider: parts[0], model: parts.slice(1).join("/") };
  }
  return { provider: "openai", model };
}
```

**Why it's wrong:** Many providers use slashes as part of the model name itself:

- HuggingFace: `meta-llama/Llama-3.1-70B-Instruct`
- OpenRouter: `openai/gpt-4o`, `anthropic/claude-sonnet-4-5-20250929`
- Vercel AI Gateway: `openai/gpt-4o`

Parsing `meta-llama/Llama-3.1-70B-Instruct` by splitting on `/` would incorrectly treat `meta-llama` as the provider, when the actual provider is `huggingface` and the full string is the model ID.

**Correct approach:** Always use the provider selected in the database/settings dropdown. The model string should be passed through as-is to the provider SDK.

```typescript
// CORRECT — provider comes from DB config, model string is opaque
const configProvider = (config.provider || "openai") as AIProvider;
const modelStr = config.model || "";

return resolveModel({
  provider: configProvider,  // from DB dropdown, never parsed from model string
  model: modelStr,           // passed through verbatim
  apiKey: config.apiKey,
  baseUrl: config.baseUrl || undefined,
});
```

See `src/lib/ai/providers.ts` — `resolveModelFromSettings()` for the canonical implementation.

### 2. Do NOT use `console.log` / `console.error` directly

**Bad:**

```typescript
console.log("Processing job", jobId);
console.error("Something failed", error);
```

**Why it's wrong:** Raw `console.*` calls produce unstructured output that can't be filtered, searched, or correlated across requests. They also risk leaking secrets (API keys, tokens) into logs in plaintext.

**Correct approach:** Use the centralized structured logger from `src/lib/logger.ts`:

```typescript
import { getLogger, maskSecret } from "@/lib/logger";
const log = getLogger("module-name");

log.info("Processing job", { jobId, type: job.type });
log.error("Something failed", { error: err.message, jobId });
log.debug("API key resolved", { apiKey: maskSecret(key) });
```

**Logger conventions:**
- Signature is `log.level(message: string, context?: object)` — message first, context second
- Do NOT use pino-style `log.info({ key: val }, "message")` — our logger has the opposite argument order
- Always use `maskSecret()` when logging API keys, tokens, or other credentials
- Use `log.child({ requestId })` to create scoped loggers that attach metadata to every subsequent log line
- Module names should use dot-notation: `"api.chat"`, `"ai.providers"`, `"integrations"`, etc.
- Use appropriate log levels: `debug` for tracing, `info` for operations, `warn` for recoverable issues, `error` for failures

**Edge Runtime exception:** `middleware.ts` runs in the Edge Runtime and cannot import Node-only modules. It uses an inline lightweight logger instead of `getLogger`. If you modify middleware, keep the inline logger pattern.

### 3. Do NOT use bare `process.env` for provider config

**Bad:**

```typescript
const apiKey = process.env.OPENAI_API_KEY;
const provider = process.env.AI_PROVIDER || "openai";
```

**Why it's wrong:** The system supports per-user settings stored in the database. Environment variables are only fallbacks. Using `process.env` directly bypasses DB-stored settings and ignores user configuration.

**Correct approach:** Use `getEffectiveAIConfig()` from `src/lib/settings.ts`:

```typescript
import { getEffectiveAIConfig } from "@/lib/settings";

const config = await getEffectiveAIConfig();
// config.provider  — resolved from DB > env > default
// config.model     — resolved from DB > env > default
// config.apiKey    — resolved from DB column > env var
// config.baseUrl   — resolved from DB > env > default
```

The resolution chain is: **DB settings → environment variable → hardcoded default**. See `src/lib/settings.ts` for the full implementation.

### 4. Do NOT resolve models directly — use `resolveModelFromSettings()`

**Bad:**

```typescript
import { createOpenAI } from "@ai-sdk/openai";
const client = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = client("gpt-4o");
```

**Why it's wrong:** This hardcodes a provider and bypasses the user's configuration. The user may have selected Anthropic, a local Ollama instance, or any other provider.

**Correct approach:**

```typescript
import { resolveModelFromSettings } from "@/lib/ai/providers";
const model = await resolveModelFromSettings();
// Uses the correct provider, model, API key, and base URL from settings
```

### 5. Do NOT declare variables inside `try` that are needed in `catch`

**Bad:**

```typescript
try {
  const start = Date.now();
  const result = await doWork();
  log.info("Done", { durationMs: Date.now() - start });
} catch (err) {
  log.error("Failed", { durationMs: Date.now() - start }); // ReferenceError: start is not defined
}
```

**Correct:**

```typescript
const startMs = Date.now();
try {
  const result = await doWork();
  log.info("Done", { durationMs: Date.now() - startMs });
} catch (err) {
  log.error("Failed", { durationMs: Date.now() - startMs });
}
```

### 6. Do NOT trust the stored `openaiBaseUrl` across provider switches

**Bad:** Assuming the `openaiBaseUrl` DB field is always valid for the current provider.

The DB has a single `openaiBaseUrl` column that persists when the user switches providers. If they previously used OpenAI with `https://api.openai.com/v1` stored, then switch to Vercel, the stale OpenAI URL would override the Vercel gateway URL.

**How it's handled:** `resolveModelFromSettings()` calls `sanitizeBaseUrl()` which checks whether the stored URL matches a known provider default. If it matches a *different* provider's default, it's discarded as stale. Only genuinely custom URLs (e.g., a self-hosted proxy) are kept.

See `src/lib/ai/providers.ts` — `sanitizeBaseUrl()` for the implementation.

---

## Key Conventions

### API Route Structure

Every API route should follow this pattern:

```typescript
import { requireSession } from "@/lib/auth-server";
import { getLogger } from "@/lib/logger";

const log = getLogger("api.route-name");

export async function GET(request: Request) {
  try {
    log.info("Route description");
    const session = await requireSession();
    // ... business logic with structured logging ...
    return Response.json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    log.error("Route failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### Settings Resolution

The `getEffectiveAIConfig()` function in `src/lib/settings.ts` is the **single source of truth** for all AI configuration. It resolves:

| Field | Resolution chain |
|-------|-----------------|
| `provider` | `AppSettings.aiProvider` → `AI_PROVIDER` env → `"openai"` |
| `model` | `AppSettings.aiModel` → `AI_MODEL` env → `""` (uses provider default) |
| `apiKey` | DB column for active provider → env var for active provider → `""` |
| `baseUrl` | `AppSettings.openaiBaseUrl` → `OPENAI_BASE_URL` env → `""` (uses provider default) |

### Provider Architecture

All AI providers are accessed through **OpenAI-compatible endpoints** using `@ai-sdk/openai`'s `createOpenAI` with custom `baseURL`. There are no separate SDKs for Anthropic, Google, etc. — they all expose OpenAI-compatible APIs. The provider registry in `PROVIDER_DEFAULTS` (`src/lib/ai/providers.ts`) maps each provider to its endpoint and default model.

### Integration Registry

Integrations (chat providers, AI models, productivity tools, etc.) are registered in `src/lib/integrations/registry.ts`. User-scoped instances are hydrated lazily on first request and cached. Call `integrationRegistry.invalidateUser(userId)` when a user changes their config.

### Job Queue

The SQLite-backed job queue (`src/lib/queue.ts`) uses a poll-based approach:
- `enqueue()` → creates a pending job and nudges the poller
- `dequeue()` → atomically claims the oldest pending job via a Prisma transaction
- `complete()` / `fail()` → marks jobs done or retries them (up to `maxRetries`)
- The poller runs on a 2-second interval and processes one job at a time
