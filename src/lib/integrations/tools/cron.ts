import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface CronConfig extends IntegrationConfig { enabled: boolean; }

export const cronIntegration: IntegrationDefinition<CronConfig> = {
  id: "cron", name: "Cron", description: "Scheduled task execution. Set up recurring tasks with cron expressions.",
  category: "tools", icon: "cron",
  configFields: [
    { key: "enabled", label: "Enabled", type: "boolean", description: "Enable scheduled tasks", required: false, default: true },
  ],
  skills: [
    { id: "cron_schedule", name: "Schedule Task", description: "Schedule a recurring task",
      parameters: [
        { name: "expression", type: "string", description: "Cron expression (e.g., '0 9 * * *' for daily at 9am)", required: true },
        { name: "task", type: "string", description: "Task description / prompt to execute", required: true },
        { name: "name", type: "string", description: "Name for this scheduled task", required: true },
      ] },
    { id: "cron_list", name: "List Tasks", description: "List all scheduled tasks", parameters: [] },
    { id: "cron_delete", name: "Delete Task", description: "Delete a scheduled task",
      parameters: [{ name: "name", type: "string", description: "Task name to delete", required: true }] },
  ],
};

export class CronInstance extends BaseIntegration<CronConfig> {
  private tasks: Map<string, { expression: string; task: string }> = new Map();

  async connect(): Promise<void> { this.status = "connected"; }
  async disconnect(): Promise<void> { this.tasks.clear(); this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "cron_schedule":
        this.tasks.set(args.name as string, { expression: args.expression as string, task: args.task as string });
        return { success: true, output: `Task "${args.name}" scheduled: ${args.expression}` };
      case "cron_list": {
        if (this.tasks.size === 0) return { success: true, output: "No scheduled tasks" };
        const list = Array.from(this.tasks.entries()).map(([name, t]) => `${name}: ${t.expression} — ${t.task}`).join("\n");
        return { success: true, output: `Scheduled tasks:\n${list}` };
      }
      case "cron_delete":
        this.tasks.delete(args.name as string);
        return { success: true, output: `Task "${args.name}" deleted` };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
