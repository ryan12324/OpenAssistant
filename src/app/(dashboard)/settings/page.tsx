"use client";

import { useSession } from "@/lib/auth-client";
import { useState, useEffect, useCallback } from "react";

interface SettingsData {
  aiProvider: string;
  aiModel: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  googleAiApiKey: string;
  mistralApiKey: string;
  xaiApiKey: string;
  deepseekApiKey: string;
  openrouterApiKey: string;
  perplexityApiKey: string;
  minimaxApiKey: string;
  glmApiKey: string;
  huggingfaceApiKey: string;
  vercelAiGatewayKey: string;
  embeddingModel: string;
  embeddingApiKey: string;
  embeddingBaseUrl: string;
}

const PROVIDERS = [
  { id: "openai", label: "OpenAI", keyField: "openaiApiKey" },
  { id: "anthropic", label: "Anthropic", keyField: "anthropicApiKey" },
  { id: "google", label: "Google AI", keyField: "googleAiApiKey" },
  { id: "mistral", label: "Mistral", keyField: "mistralApiKey" },
  { id: "xai", label: "xAI (Grok)", keyField: "xaiApiKey" },
  { id: "deepseek", label: "DeepSeek", keyField: "deepseekApiKey" },
  { id: "openrouter", label: "OpenRouter", keyField: "openrouterApiKey" },
  { id: "perplexity", label: "Perplexity", keyField: "perplexityApiKey" },
  { id: "ollama", label: "Ollama (local)", keyField: "" },
  { id: "lmstudio", label: "LM Studio (local)", keyField: "" },
  { id: "minimax", label: "MiniMax", keyField: "minimaxApiKey" },
  { id: "glm", label: "GLM (Zhipu)", keyField: "glmApiKey" },
  { id: "huggingface", label: "Hugging Face", keyField: "huggingfaceApiKey" },
  { id: "vercel", label: "Vercel AI Gateway", keyField: "vercelAiGatewayKey" },
] as const;

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-5-20250929",
  google: "gemini-2.5-pro",
  mistral: "mistral-large-latest",
  xai: "grok-3",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o",
  perplexity: "sonar-pro",
  ollama: "llama3.1",
  lmstudio: "local-model",
  minimax: "MiniMax-M2.1",
  glm: "glm-4-plus",
  huggingface: "meta-llama/Llama-3.1-70B-Instruct",
  vercel: "openai/gpt-4o",
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [ragHealth, setRagHealth] = useState<{
    status: string;
    lightrag: boolean;
    rag_anything: boolean;
  } | null>(null);

  const fetchSettings = useCallback(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setSettings(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSettings();
    fetch("/api/health")
      .then((res) => res.json())
      .then(setRagHealth)
      .catch(() => {});
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaveMsg("Saved");
        fetchSettings();
      } else {
        setSaveMsg("Failed to save");
      }
    } catch {
      setSaveMsg("Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  const update = (field: keyof SettingsData, value: string) => {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const selectedProvider = PROVIDERS.find(
    (p) => p.id === (settings?.aiProvider || "openai")
  );
  const activeKeyField = selectedProvider?.keyField || "";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your OpenAssistant instance
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Account Info */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-medium">Account</h2>
            {session?.user ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="text-sm">{session.user.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm">{session.user.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
          </div>

          {/* AI Model Configuration */}
          {settings && (
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-medium">AI Model</h2>
                <div className="flex items-center gap-2">
                  {saveMsg && (
                    <span className="text-xs text-muted-foreground">
                      {saveMsg}
                    </span>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              <p className="mb-4 text-xs text-muted-foreground">
                Settings saved here override environment variables. Leave fields
                empty to use env defaults.
              </p>

              <div className="space-y-4">
                {/* Provider */}
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    Provider
                  </label>
                  <select
                    value={settings.aiProvider || "openai"}
                    onChange={(e) => update("aiProvider", e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Model */}
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    Model
                  </label>
                  <input
                    type="text"
                    value={settings.aiModel}
                    onChange={(e) => update("aiModel", e.target.value)}
                    placeholder={
                      DEFAULT_MODELS[settings.aiProvider || "openai"] ||
                      "gpt-4o"
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>

                {/* API Key for active provider */}
                {activeKeyField && (
                  <div>
                    <label className="mb-1 block text-sm text-muted-foreground">
                      {selectedProvider?.label} API Key
                    </label>
                    <input
                      type="password"
                      value={
                        settings[activeKeyField as keyof SettingsData] || ""
                      }
                      onChange={(e) =>
                        update(
                          activeKeyField as keyof SettingsData,
                          e.target.value
                        )
                      }
                      placeholder="sk-..."
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Leave empty to use the environment variable
                    </p>
                  </div>
                )}

                {/* Base URL override */}
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    Base URL Override
                  </label>
                  <input
                    type="text"
                    value={settings.openaiBaseUrl}
                    onChange={(e) => update("openaiBaseUrl", e.target.value)}
                    placeholder="Leave empty for provider default"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Embedding Configuration */}
          {settings && (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="mb-4 font-medium">Embedding Model</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Used by the RAG memory system. Defaults to the LLM provider
                settings if left empty.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    Embedding Model
                  </label>
                  <input
                    type="text"
                    value={settings.embeddingModel}
                    onChange={(e) => update("embeddingModel", e.target.value)}
                    placeholder="text-embedding-3-small"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    Embedding API Key
                  </label>
                  <input
                    type="password"
                    value={settings.embeddingApiKey}
                    onChange={(e) => update("embeddingApiKey", e.target.value)}
                    placeholder="Same as LLM provider key"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    Embedding Base URL
                  </label>
                  <input
                    type="text"
                    value={settings.embeddingBaseUrl}
                    onChange={(e) => update("embeddingBaseUrl", e.target.value)}
                    placeholder="Same as LLM provider URL"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* RAG System Status */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-medium">Memory System (RAG)</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm">LightRAG Engine</p>
                <StatusBadge active={ragHealth?.lightrag} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm">RAG-Anything (Multimodal)</p>
                <StatusBadge active={ragHealth?.rag_anything} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm">Server Status</p>
                <StatusBadge active={ragHealth?.status === "ok"} />
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              The memory system uses LightRAG with a knowledge graph for
              persistent memory. RAG-Anything enables multimodal document
              processing (PDFs, images, tables).
            </p>
          </div>

          {/* Architecture Info */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-medium">Architecture</h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Frontend:</strong> Next.js
                + TypeScript + Tailwind CSS
              </p>
              <p>
                <strong className="text-foreground">Auth:</strong> Better
                Auth with email/password and OAuth
              </p>
              <p>
                <strong className="text-foreground">AI:</strong> Vercel AI
                SDK with OpenAI-compatible models
              </p>
              <p>
                <strong className="text-foreground">Memory:</strong> LightRAG
                knowledge graph + RAG-Anything
              </p>
              <p>
                <strong className="text-foreground">Database:</strong> SQLite
                via Prisma ORM
              </p>
              <p>
                <strong className="text-foreground">Skills:</strong>{" "}
                Extensible plugin system with memory, web, and productivity
                tools
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ active }: { active?: boolean }) {
  if (active === undefined) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        checking...
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? "bg-green-500/10 text-green-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
