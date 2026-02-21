# AGENTS.md — Development Guidelines

## Known Antipatterns

### Do NOT parse provider names from model strings

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

**Why it's wrong:** Many providers use slashes as part of the model name itself. For example:

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
