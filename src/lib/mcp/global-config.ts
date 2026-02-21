import { readFile } from "fs/promises";
import { resolve } from "path";
import { homedir } from "os";
import type { McpServerConfig } from "./types";

/**
 * Global MCP server configuration read from a JSON file.
 *
 * Checked paths (first found wins):
 *   1. ./mcp-servers.json  (project root)
 *   2. ~/.openassistant/mcp-servers.json  (user home)
 *
 * Format (matches Claude Desktop / OpenClaw convention):
 * {
 *   "mcpServers": {
 *     "github": {
 *       "transport": "stdio",
 *       "command": "npx",
 *       "args": ["-y", "@modelcontextprotocol/server-github"],
 *       "env": { "GITHUB_TOKEN": "ghp_..." }
 *     },
 *     "remote-search": {
 *       "transport": "http",
 *       "url": "https://search.example.com/mcp"
 *     }
 *   }
 * }
 */

interface GlobalConfigFile {
  mcpServers?: Record<
    string,
    {
      transport?: "stdio" | "http";
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
      headers?: Record<string, string>;
      enabled?: boolean;
    }
  >;
}

const CONFIG_PATHS = [
  resolve(process.cwd(), "mcp-servers.json"),
  resolve(homedir(), ".openassistant", "mcp-servers.json"),
];

let _cache: McpServerConfig[] | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 30_000; // Re-read file every 30 seconds

/**
 * Load global MCP server configs from the first config file found.
 * Results are cached for 30 seconds to avoid excessive FS reads.
 */
export async function loadGlobalMcpServers(): Promise<McpServerConfig[]> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL_MS) return _cache;

  for (const configPath of CONFIG_PATHS) {
    try {
      const raw = await readFile(configPath, "utf-8");
      const parsed: GlobalConfigFile = JSON.parse(raw);
      const servers = parsed.mcpServers;

      if (!servers || typeof servers !== "object") continue;

      const configs: McpServerConfig[] = Object.entries(servers).map(
        ([name, entry]) => {
          const transport = entry.transport ?? (entry.command ? "stdio" : "http");
          return {
            id: `global:${name}`,
            name,
            transport,
            command: entry.command,
            args: entry.args,
            env: entry.env,
            url: entry.url,
            headers: entry.headers,
            enabled: entry.enabled !== false,
            scope: "global" as const,
          };
        }
      );

      _cache = configs;
      _cacheTime = now;
      return configs;
    } catch {
      // File not found or invalid JSON — try next path
      continue;
    }
  }

  _cache = [];
  _cacheTime = now;
  return [];
}

/**
 * Invalidate the global config cache (e.g. after user edits the file).
 */
export function invalidateGlobalConfigCache(): void {
  _cache = null;
  _cacheTime = 0;
}
