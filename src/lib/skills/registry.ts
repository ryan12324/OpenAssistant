import type { SkillDefinition } from "./types";
import { memorySkills } from "./builtin/memory-skills";
import { webSkills } from "./builtin/web-skills";
import { productivitySkills } from "./builtin/productivity-skills";
import { agentSkills } from "./builtin/agent-skills";

class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();

  constructor() {
    // Register all built-in skills
    this.registerMany(memorySkills);
    this.registerMany(webSkills);
    this.registerMany(productivitySkills);
    this.registerMany(agentSkills);
  }

  register(skill: SkillDefinition): void {
    this.skills.set(skill.id, skill);
  }

  registerMany(skills: SkillDefinition[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  getByCategory(category: string): SkillDefinition[] {
    return this.getAll().filter((s) => s.category === category);
  }

  /**
   * Convert skills to the OpenAI tool format for the AI SDK.
   */
  toToolDefinitions(): Record<string, unknown>[] {
    return this.getAll().map((skill) => ({
      type: "function",
      function: {
        name: skill.id,
        description: skill.description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            skill.parameters.map((p) => [
              p.name,
              {
                type: p.type,
                description: p.description,
              },
            ])
          ),
          required: skill.parameters
            .filter((p) => p.required)
            .map((p) => p.name),
        },
      },
    }));
  }

  /**
   * Convert skills to Vercel AI SDK tool format.
   */
  toAITools() {
    const tools: Record<string, { description: string; parameters: Record<string, unknown> }> = {};

    for (const skill of this.getAll()) {
      const properties: Record<string, { type: string; description: string }> = {};
      const required: string[] = [];

      for (const param of skill.parameters) {
        properties[param.name] = {
          type: param.type,
          description: param.description,
        };
        if (param.required) {
          required.push(param.name);
        }
      }

      tools[skill.id] = {
        description: skill.description,
        parameters: {
          type: "object",
          properties,
          required,
        },
      };
    }

    return tools;
  }
}

export const skillRegistry = new SkillRegistry();
