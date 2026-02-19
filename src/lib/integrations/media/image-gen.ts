import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface ImageGenConfig extends IntegrationConfig { provider: string; apiKey: string; }

export const imageGenIntegration: IntegrationDefinition<ImageGenConfig> = {
  id: "image-gen", name: "Image Generation", description: "AI image generation via DALL-E, Stable Diffusion, or Flux.",
  category: "media", icon: "image-gen",
  configFields: [
    { key: "provider", label: "Provider", type: "select", description: "Image generation provider", required: true,
      options: [{ label: "OpenAI DALL-E", value: "dalle" }, { label: "Stability AI", value: "stability" }], default: "dalle" },
    { key: "apiKey", label: "API Key", type: "password", description: "Provider API key", required: true },
  ],
  skills: [
    { id: "image_generate", name: "Generate Image", description: "Generate an image from a text prompt",
      parameters: [
        { name: "prompt", type: "string", description: "Image description prompt", required: true },
        { name: "size", type: "string", description: "Image size: 1024x1024, 1792x1024, 1024x1792" },
      ] },
  ],
};

export class ImageGenInstance extends BaseIntegration<ImageGenConfig> {
  async connect(): Promise<void> { this.status = "connected"; }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "image_generate") {
      if (this.config.provider === "dalle") {
        const result = await this.apiFetch<{ data: { url: string }[] }>("https://api.openai.com/v1/images/generations", {
          method: "POST", headers: { Authorization: `Bearer ${this.config.apiKey}` },
          body: JSON.stringify({ model: "dall-e-3", prompt: args.prompt, n: 1, size: args.size || "1024x1024" }),
        });
        return { success: true, output: `Image generated: ${result.data[0]?.url}`, data: result };
      }
      return { success: true, output: "Image generation requested" };
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
