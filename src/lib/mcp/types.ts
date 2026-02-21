/**
 * Types for the MCP (Model Context Protocol) client system.
 * OpenAssistant acts as an MCP client, consuming external MCP servers.
 */

export interface McpServerConfig {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Transport type */
  transport: "stdio" | "http";
  /** stdio: command to spawn */
  command?: string;
  /** stdio: arguments for the command */
  args?: string[];
  /** stdio: environment variables for the child process */
  env?: Record<string, string>;
  /** http: server URL (Streamable HTTP endpoint) */
  url?: string;
  /** http: optional auth/custom headers */
  headers?: Record<string, string>;
  /** Whether this server is active */
  enabled: boolean;
  /** Where the config comes from */
  scope: "user" | "global";
}

export interface McpToolAnnotation {
  /** Human-readable title for the tool */
  title?: string;
  /** If true, the tool only reads data and has no side effects */
  readOnlyHint?: boolean;
  /** If true, the tool may perform destructive operations (delete, overwrite) */
  destructiveHint?: boolean;
  /** If true, calling the tool multiple times with the same args has the same effect */
  idempotentHint?: boolean;
  /** If true, the tool interacts with the real world beyond the server */
  openWorldHint?: boolean;
}

export interface McpDiscoveredTool {
  /** ID of the MCP server that provides this tool */
  serverId: string;
  /** Display name of the MCP server */
  serverName: string;
  /** Tool name as declared by the server */
  name: string;
  /** Tool description */
  description?: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /** Permission/behavior annotations from the server */
  annotations?: McpToolAnnotation;
}

export type McpServerStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface McpServerState {
  config: McpServerConfig;
  status: McpServerStatus;
  error?: string;
  /** Tools discovered via tools/list handshake */
  tools: McpDiscoveredTool[];
  /** When the connection was last established */
  connectedAt?: Date;
}
