"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "boolean" | "select";
  description: string;
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  default?: string | number | boolean;
}

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  website?: string;
  configFields: ConfigField[];
  skills: { id: string; name: string; description: string }[];
  supportsInbound: boolean;
  supportsOutbound: boolean;
  enabled: boolean;
  configured: boolean;
}

const categoryLabels: Record<string, string> = {
  chat: "Chat Providers",
  ai: "AI Models",
  productivity: "Productivity",
  music: "Music & Audio",
  "smart-home": "Smart Home",
  tools: "Tools & Automation",
  media: "Media & Creative",
  social: "Social",
};

const categoryOrder = ["chat", "ai", "productivity", "tools", "music", "smart-home", "media", "social"];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ id: string; message: string; type: "success" | "error" } | null>(null);

  const loadIntegrations = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations");
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const categories = categoryOrder.filter((cat) =>
    integrations.some((i) => i.category === cat)
  );

  const filtered =
    selectedCategory === "all"
      ? integrations
      : integrations.filter((i) => i.category === selectedCategory);

  // Group by category
  const grouped = categories
    .filter((cat) => selectedCategory === "all" || cat === selectedCategory)
    .map((cat) => ({
      category: cat,
      label: categoryLabels[cat] || cat,
      items: filtered.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  function openConfig(integration: Integration) {
    const defaults: Record<string, string | number | boolean> = {};
    for (const field of integration.configFields) {
      if (field.default !== undefined) defaults[field.key] = field.default;
    }
    setConfigValues(defaults);
    setConfiguring(integration.id);
  }

  async function saveConfig(integrationId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId,
          enabled: true,
          config: configValues,
        }),
      });
      const data = await res.json();

      if (data.status === "connected") {
        setStatusMessage({ id: integrationId, message: "Connected successfully!", type: "success" });
      } else if (data.status === "error") {
        setStatusMessage({ id: integrationId, message: data.error || "Connection failed", type: "error" });
      } else {
        setStatusMessage({ id: integrationId, message: "Configuration saved", type: "success" });
      }

      setConfiguring(null);
      loadIntegrations();
    } catch {
      setStatusMessage({ id: integrationId, message: "Failed to save", type: "error" });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  }

  async function toggleIntegration(integrationId: string, enabled: boolean) {
    await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationId, enabled }),
    });
    loadIntegrations();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect your assistant to {integrations.length} services across chat, AI, productivity, and more
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory("all")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                selectedCategory === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              All ({integrations.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm",
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {categoryLabels[cat]} ({integrations.filter((i) => i.category === cat).length})
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Loading integrations...</div>
          ) : (
            grouped.map((group) => (
              <div key={group.category}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((integration) => (
                    <div
                      key={integration.id}
                      className={cn(
                        "rounded-lg border bg-card p-4 transition-colors",
                        integration.enabled ? "border-primary/50" : "border-border"
                      )}
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <h3 className="font-medium">{integration.name}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {integration.description}
                          </p>
                        </div>
                        {integration.configured && (
                          <button
                            onClick={() => toggleIntegration(integration.id, !integration.enabled)}
                            className={cn(
                              "relative ml-2 h-5 w-9 shrink-0 rounded-full transition-colors",
                              integration.enabled ? "bg-primary" : "bg-muted"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                                integration.enabled ? "left-[18px]" : "left-0.5"
                              )}
                            />
                          </button>
                        )}
                      </div>

                      {/* Skills count */}
                      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                        {integration.skills.length > 0 && (
                          <span>{integration.skills.length} skill{integration.skills.length !== 1 ? "s" : ""}</span>
                        )}
                        {integration.supportsInbound && <span>Inbound</span>}
                        {integration.supportsOutbound && <span>Outbound</span>}
                      </div>

                      {/* Status message */}
                      {statusMessage?.id === integration.id && (
                        <p className={cn("mb-2 text-xs", statusMessage.type === "success" ? "text-green-400" : "text-red-400")}>
                          {statusMessage.message}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openConfig(integration)}
                          className="rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {integration.configured ? "Reconfigure" : "Set Up"}
                        </button>
                        {integration.website && (
                          <a
                            href={integration.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            Docs
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Configuration Modal */}
      {configuring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfiguring(null)}>
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const integration = integrations.find((i) => i.id === configuring);
              if (!integration) return null;
              return (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">{integration.name}</h2>
                      <p className="text-sm text-muted-foreground">{integration.description}</p>
                    </div>
                    <button onClick={() => setConfiguring(null)} className="text-muted-foreground hover:text-foreground">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {integration.configFields.map((field) => (
                      <div key={field.key}>
                        <label className="mb-1 block text-sm font-medium">
                          {field.label}
                          {field.required && <span className="text-destructive"> *</span>}
                        </label>
                        <p className="mb-1.5 text-xs text-muted-foreground">{field.description}</p>

                        {field.type === "select" ? (
                          <select
                            value={(configValues[field.key] as string) || (field.default as string) || ""}
                            onChange={(e) => setConfigValues((v) => ({ ...v, [field.key]: e.target.value }))}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
                          >
                            {field.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : field.type === "boolean" ? (
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={(configValues[field.key] as boolean) ?? (field.default as boolean) ?? false}
                              onChange={(e) => setConfigValues((v) => ({ ...v, [field.key]: e.target.checked }))}
                              className="h-4 w-4 rounded border-input"
                            />
                            <span className="text-sm">Enabled</span>
                          </label>
                        ) : (
                          <input
                            type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                            value={(configValues[field.key] as string) || ""}
                            onChange={(e) => setConfigValues((v) => ({
                              ...v,
                              [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value,
                            }))}
                            placeholder={field.placeholder}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Skills preview */}
                  {integration.skills.length > 0 && (
                    <div className="mt-4 rounded-md bg-muted p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Skills this integration adds:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {integration.skills.map((skill) => (
                          <span key={skill.id} className="rounded bg-background px-2 py-0.5 text-xs" title={skill.description}>
                            {skill.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => setConfiguring(null)}
                      className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveConfig(integration.id)}
                      disabled={saving}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? "Connecting..." : "Connect & Save"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
