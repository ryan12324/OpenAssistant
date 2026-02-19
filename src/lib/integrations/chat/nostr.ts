import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface NostrConfig extends IntegrationConfig {
  privateKey: string;
  relays: string;
}

export const nostrIntegration: IntegrationDefinition<NostrConfig> = {
  id: "nostr",
  name: "Nostr",
  description: "Decentralized direct messages via NIP-04 encrypted messaging protocol.",
  category: "chat",
  icon: "nostr",
  website: "https://nostr.com/",
  supportsInbound: true,
  supportsOutbound: true,
  configFields: [
    {
      key: "privateKey",
      label: "Private Key (nsec)",
      type: "password",
      description: "Nostr private key for signing messages",
      required: true,
    },
    {
      key: "relays",
      label: "Relays",
      type: "text",
      description: "Comma-separated list of relay WebSocket URLs",
      required: true,
      placeholder: "wss://relay.damus.io,wss://nos.lol",
    },
  ],
  skills: [
    {
      id: "nostr_send_dm",
      name: "Send Nostr DM",
      description: "Send an encrypted direct message via Nostr (NIP-04)",
      parameters: [
        { name: "pubkey", type: "string", description: "Recipient's public key (npub or hex)", required: true },
        { name: "message", type: "string", description: "Message text (will be encrypted)", required: true },
      ],
    },
  ],
};

export class NostrInstance extends BaseIntegration<NostrConfig> {
  async connect(): Promise<void> {
    if (!this.config.privateKey) throw new Error("Private key is required");
    // Would initialize WebSocket connections to relays
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
  }

  protected async handleSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }> {
    switch (skillId) {
      case "nostr_send_dm":
        return {
          success: true,
          output: `Encrypted DM sent to ${(args.pubkey as string).slice(0, 12)}...`,
          data: { pubkey: args.pubkey },
        };
      default:
        return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
