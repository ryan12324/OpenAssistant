import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface CanvasConfig extends IntegrationConfig { enabled: boolean; }

export const canvasIntegration: IntegrationDefinition<CanvasConfig> = {
  id: "canvas", name: "Canvas", description: "Agent-driven visual workspace with A2UI. Render charts, diagrams, and interactive UIs.",
  category: "tools", icon: "canvas",
  configFields: [
    { key: "enabled", label: "Enabled", type: "boolean", description: "Enable the Canvas visual workspace", required: false, default: true },
  ],
  skills: [
    { id: "canvas_render", name: "Render Canvas", description: "Render HTML/SVG content in the visual workspace",
      parameters: [{ name: "html", type: "string", description: "HTML/SVG content to render", required: true }, { name: "title", type: "string", description: "Canvas title" }] },
    { id: "canvas_chart", name: "Create Chart", description: "Generate a chart visualization",
      parameters: [{ name: "type", type: "string", description: "Chart type: bar, line, pie", required: true }, { name: "data", type: "string", description: "JSON chart data", required: true }, { name: "title", type: "string", description: "Chart title" }] },
  ],
};

export class CanvasInstance extends BaseIntegration<CanvasConfig> {
  async connect(): Promise<void> { this.status = "connected"; }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "canvas_render": return { success: true, output: `Canvas rendered: ${args.title || "Untitled"}`, data: { html: args.html } };
      case "canvas_chart": return { success: true, output: `${args.type} chart created: ${args.title || "Untitled"}`, data: { type: args.type, data: args.data } };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
