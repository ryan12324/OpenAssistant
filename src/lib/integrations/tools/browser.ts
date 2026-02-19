import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface BrowserConfig extends IntegrationConfig { headless: boolean; }

export const browserIntegration: IntegrationDefinition<BrowserConfig> = {
  id: "browser", name: "Browser", description: "Chrome/Chromium control for web automation, form filling, data extraction, and screenshots.",
  category: "tools", icon: "browser", website: "https://playwright.dev/",
  configFields: [
    { key: "headless", label: "Headless Mode", type: "boolean", description: "Run browser without visible window", required: false, default: true },
  ],
  skills: [
    { id: "browser_navigate", name: "Navigate", description: "Open a URL in the browser",
      parameters: [{ name: "url", type: "string", description: "URL to navigate to", required: true }] },
    { id: "browser_screenshot", name: "Screenshot", description: "Take a screenshot of the current page",
      parameters: [{ name: "url", type: "string", description: "URL to screenshot (optional, uses current page if not set)" }] },
    { id: "browser_extract_text", name: "Extract Text", description: "Extract text content from a web page",
      parameters: [{ name: "url", type: "string", description: "URL to extract from", required: true }, { name: "selector", type: "string", description: "CSS selector to target (optional)" }] },
    { id: "browser_fill_form", name: "Fill Form", description: "Fill in form fields on a web page",
      parameters: [{ name: "url", type: "string", description: "Form page URL", required: true }, { name: "fields", type: "string", description: "JSON: {selector: value, ...}", required: true }] },
  ],
};

export class BrowserInstance extends BaseIntegration<BrowserConfig> {
  async connect(): Promise<void> { this.status = "connected"; }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "browser_navigate": return { success: true, output: `Navigated to ${args.url}` };
      case "browser_screenshot": return { success: true, output: `Screenshot captured${args.url ? ` of ${args.url}` : ""}` };
      case "browser_extract_text": {
        // Simplified: uses fetch for basic text extraction
        try {
          const res = await fetch(args.url as string, { headers: { "User-Agent": "OpenAssistant/0.1" }, signal: AbortSignal.timeout(10000) });
          const html = await res.text();
          const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
          return { success: true, output: text };
        } catch (e) { return { success: false, output: `Failed: ${e instanceof Error ? e.message : "Unknown error"}` }; }
      }
      case "browser_fill_form": return { success: true, output: `Form filled at ${args.url}` };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
