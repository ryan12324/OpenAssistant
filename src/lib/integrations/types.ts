/**
 * Core types for the OpenAssistant integration system.
 * Every integration (chat provider, AI model, productivity tool, etc.)
 * implements these interfaces.
 */

export type IntegrationCategory =
  | "chat"
  | "ai"
  | "productivity"
  | "music"
  | "smart-home"
  | "tools"
  | "media"
  | "social";

export type IntegrationStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface IntegrationConfig {
  [key: string]: string | number | boolean | undefined;
}

export interface IntegrationConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "boolean" | "select";
  description: string;
  required: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  default?: string | number | boolean;
}

export interface IntegrationDefinition<
  TConfig extends IntegrationConfig = IntegrationConfig,
> {
  /** Unique identifier (e.g., "telegram", "spotify") */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Category for grouping */
  category: IntegrationCategory;
  /** Icon identifier or emoji */
  icon: string;
  /** URL to the service's website */
  website?: string;
  /** Configuration fields needed */
  configFields: IntegrationConfigField[];
  /** Skills this integration provides to the AI agent */
  skills: IntegrationSkill[];
  /** Whether this integration can receive inbound messages */
  supportsInbound?: boolean;
  /** Whether this integration can send outbound messages */
  supportsOutbound?: boolean;
}

export interface IntegrationSkill {
  id: string;
  name: string;
  description: string;
  parameters: {
    name: string;
    type: "string" | "number" | "boolean";
    description: string;
    required?: boolean;
  }[];
}

export interface IntegrationInstance<
  TConfig extends IntegrationConfig = IntegrationConfig,
> {
  definition: IntegrationDefinition<TConfig>;
  config: TConfig;
  status: IntegrationStatus;

  /** Connect/initialize the integration */
  connect(): Promise<void>;
  /** Disconnect/cleanup */
  disconnect(): Promise<void>;
  /** Execute a skill action */
  executeSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }>;
  /** Handle an inbound message (for chat providers) */
  handleInbound?(message: InboundMessage): Promise<void>;
}

export interface InboundAttachment {
  /** Unique file ID on the source platform */
  fileId: string;
  /** Original file name */
  fileName: string;
  /** MIME type if known */
  mimeType?: string;
  /** File size in bytes if known */
  size?: number;
  /** Direct download URL (may require auth) */
  url?: string;
}

export interface InboundMessage {
  source: string;
  senderId: string;
  senderName?: string;
  content: string;
  timestamp: Date;
  /** File attachments from the message */
  attachments?: InboundAttachment[];
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  target: string;
  recipientId: string;
  content: string;
  metadata?: Record<string, unknown>;
}
