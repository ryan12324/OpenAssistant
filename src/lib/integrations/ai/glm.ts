import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface GLMConfig extends IntegrationConfig {
  apiKey: string;
  model?: string;
}

export const glmIntegration: IntegrationDefinition<GLMConfig> = {
  id: "glm",
  name: "GLM (ChatGLM)",
  description: "ChatGLM models from Zhipu AI. Strong Chinese and multilingual language support.",
  category: "ai",
  icon: "glm",
  website: "https://open.bigmodel.cn/",
  configFields: [
    { key: "apiKey", label: "API Key", type: "password", description: "Zhipu AI API key", required: true },
    { key: "model", label: "Default Model", type: "select", description: "Default model", required: false, options: [
      { label: "GLM-4-Plus", value: "glm-4-plus" },
      { label: "GLM-4", value: "glm-4" },
      { label: "GLM-4-Flash", value: "glm-4-flash" },
    ], default: "glm-4-plus" },
  ],
  skills: [
    {
      id: "glm_complete",
      name: "GLM Completion",
      description: "Generate a completion using ChatGLM models",
      parameters: [
        { name: "prompt", type: "string", description: "The prompt", required: true },
        { name: "model", type: "string", description: "Model override" },
      ],
    },
  ],
};

export class GLMInstance extends BaseIntegration<GLMConfig> {
  async connect(): Promise<void> {
    const result = await this.apiFetch<{ choices: unknown[] }>("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ model: this.config.model || "glm-4-flash", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
    });
    if (result.choices) this.status = "connected";
  }

  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "glm_complete": {
        const result = await this.apiFetch<{ choices: { message: { content: string } }[] }>(
          "https://open.bigmodel.cn/api/paas/v4/chat/completions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${this.config.apiKey}` },
            body: JSON.stringify({
              model: args.model || this.config.model || "glm-4-plus",
              messages: [{ role: "user", content: args.prompt }],
              max_tokens: 4096,
            }),
          }
        );
        return { success: true, output: result.choices[0]?.message?.content || "", data: result };
      }
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
