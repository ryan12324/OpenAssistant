"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: { name: string; type: string; description: string; required?: boolean }[];
}

const categoryColors: Record<string, string> = {
  memory: "bg-blue-500/10 text-blue-400",
  web: "bg-green-500/10 text-green-400",
  productivity: "bg-yellow-500/10 text-yellow-400",
  code: "bg-orange-500/10 text-orange-400",
  system: "bg-red-500/10 text-red-400",
  communication: "bg-purple-500/10 text-purple-400",
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    fetch("/api/skills")
      .then((res) => res.json())
      .then((data) => setSkills(data.skills || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories = [
    "all",
    ...Array.from(new Set(skills.map((s) => s.category))),
  ];
  const filtered =
    selectedCategory === "all"
      ? skills
      : skills.filter((s) => s.category === selectedCategory);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Skills</h1>
        <p className="text-sm text-muted-foreground">
          Tools and capabilities available to your assistant — {skills.length}{" "}
          skills active
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm capitalize",
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {cat.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Skills Grid */}
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              Loading skills...
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((skill) => (
                <div
                  key={skill.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-medium">{skill.name}</h3>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        categoryColors[skill.category] ||
                          "bg-muted text-muted-foreground"
                      )}
                    >
                      {skill.category}
                    </span>
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {skill.description}
                  </p>
                  {skill.parameters.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Parameters:
                      </p>
                      {skill.parameters.map((param) => (
                        <div
                          key={param.name}
                          className="flex items-center gap-2 text-xs"
                        >
                          <code className="rounded bg-muted px-1 py-0.5">
                            {param.name}
                          </code>
                          <span className="text-muted-foreground">
                            {param.type}
                          </span>
                          {param.required && (
                            <span className="text-destructive">*</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
