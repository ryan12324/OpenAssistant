import type {
  IntegrationDefinition,
  IntegrationInstance,
  IntegrationConfig,
  IntegrationStatus,
} from "../types";

/**
 * Base class for all integration instances.
 * Provides common lifecycle management and skill execution routing.
 */
export abstract class BaseIntegration<TConfig extends IntegrationConfig = IntegrationConfig>
  implements IntegrationInstance<TConfig>
{
  definition: IntegrationDefinition<TConfig>;
  config: TConfig;
  status: IntegrationStatus = "disconnected";

  constructor(definition: IntegrationDefinition<TConfig>, config: TConfig) {
    this.definition = definition;
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  async executeSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }> {
    const skill = this.definition.skills.find((s) => s.id === skillId);
    if (!skill) {
      return { success: false, output: `Skill "${skillId}" not found in ${this.definition.name}` };
    }

    if (this.status !== "connected") {
      return {
        success: false,
        output: `${this.definition.name} is not connected. Please configure and connect it first.`,
      };
    }

    try {
      return await this.handleSkill(skillId, args);
    } catch (error) {
      return {
        success: false,
        output: `${this.definition.name} error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Subclasses implement this to handle specific skill executions.
   */
  protected abstract handleSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }>;

  /**
   * Helper for making authenticated API requests.
   */
  protected async apiFetch<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error (${res.status}): ${body}`);
    }

    return res.json() as Promise<T>;
  }
}
