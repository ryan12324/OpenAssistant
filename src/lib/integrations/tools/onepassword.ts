import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface OnePasswordConfig extends IntegrationConfig { serviceAccountToken: string; }

export const onepasswordIntegration: IntegrationDefinition<OnePasswordConfig> = {
  id: "1password", name: "1Password", description: "Secure credential management via 1Password Connect or CLI.",
  category: "tools", icon: "1password", website: "https://developer.1password.com/",
  configFields: [
    { key: "serviceAccountToken", label: "Service Account Token", type: "password", description: "1Password service account token", required: true },
  ],
  skills: [
    { id: "1password_get_secret", name: "Get Secret", description: "Retrieve a secret from 1Password",
      parameters: [{ name: "reference", type: "string", description: "Secret reference (op://vault/item/field)", required: true }] },
    { id: "1password_list_vaults", name: "List Vaults", description: "List accessible 1Password vaults", parameters: [] },
  ],
};

export class OnePasswordInstance extends BaseIntegration<OnePasswordConfig> {
  async connect(): Promise<void> {
    // Would use 1Password Connect API or CLI
    if (!this.config.serviceAccountToken) throw new Error("Service account token required");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "1password_get_secret":
        return { success: true, output: `Secret retrieved for ${args.reference}`, data: { reference: args.reference } };
      case "1password_list_vaults":
        return { success: true, output: "Vaults listed (requires 1Password Connect server)" };
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
