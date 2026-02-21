# MCP Client Implementation Plan

## Summary
Add MCP (Model Context Protocol) Client support to OpenAssistant so it can consume external MCP servers (GitHub MCP, Notion MCP, filesystem, etc.) as additional tools in the AI agent. Both **stdio** (local child process) and **Streamable HTTP** (remote) transports will be supported. MCP servers can be configured **per-user** (via the Settings/MCP UI page) and **globally** (via a `mcp-servers.json` config file). Permission gating uses **MCP tool annotations** — `readOnlyHint` tools auto-approve, `destructiveHint` tools require user confirmation.

## Decisions (from user)
- **Role**: Client only (consume external MCP servers, do NOT expose our tools via MCP)
- **Transport**: Both stdio + Streamable HTTP
- **Scope**: Both per-user (DB/UI) + global (config file)
- **Permissions**: Annotation-based auto-gating

---

## Phase 1: Core MCP Client Infrastructure

### Step 1: Add dependency
- `npm install @modelcontextprotocol/sdk`
- We use the raw SDK (not `@ai-sdk/mcp`) because we need:
  - Fine-grained lifecycle control (spawn, reconnect, graceful shutdown)
  - Access to tool annotations for permission gating
  - Custom transport selection (stdio vs HTTP)

### Step 2: Create `src/lib/mcp/types.ts`
Define TypeScript types:
```typescript
export interface McpServerConfig {
  id: string;              // unique identifier
  name: string;            // display name
  transport: "stdio" | "http";
  // stdio config
  command?: string;        // e.g. "npx"
  args?: string[];         // e.g. ["-y", "@modelcontextprotocol/server-github"]
  env?: Record<string, string>; // e.g. { GITHUB_TOKEN: "..." }
  // http config
  url?: string;            // e.g. "https://mcp.example.com/sse"
  headers?: Record<string, string>; // auth headers
  // common
  enabled: boolean;
  scope: "user" | "global";
}

export interface McpDiscoveredTool {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;  // JSON Schema
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export type McpServerStatus = "disconnected" | "connecting" | "connected" | "error";
```

### Step 3: Create `src/lib/mcp/client.ts`
The `McpClientManager` class:
- Manages a map of MCP server connections keyed by `userId:serverId` (user-scoped) or `global:serverId`
- For **stdio**: spawns child process using `StdioClientTransport` from the MCP SDK
- For **http**: connects using `StreamableHTTPClientTransport`
- On connect: calls `client.listTools()` to discover available tools and caches them
- Provides `getToolsForUser(userId)` that returns all discovered tools from active servers
- Provides `callTool(serverId, toolName, args)` to route tool calls
- Lifecycle: `connectServer()`, `disconnectServer()`, `reconnect()` with exponential backoff
- Graceful shutdown on process exit

### Step 4: Create `src/lib/mcp/permissions.ts`
Annotation-based permission checker:
```typescript
export function getToolApprovalRequirement(tool: McpDiscoveredTool): "auto" | "confirm" {
  const annotations = tool.annotations;
  if (!annotations) return "confirm"; // unknown tools default to confirm
  if (annotations.destructiveHint) return "confirm";
  if (annotations.readOnlyHint) return "auto";
  return "confirm"; // default to confirm for safety
}
```

---

## Phase 2: Configuration Layer

### Step 5: Add `McpServer` model to `prisma/schema.prisma`
```prisma
model McpServer {
  id        String   @id @default(cuid())
  name      String
  transport String   // "stdio" | "http"
  command   String?  // stdio: command to run
  args      String?  // JSON array of args
  env       String?  // JSON object of env vars (encrypted values)
  url       String?  // http: server URL
  headers   String?  // JSON object of headers
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, name])
}
```
- Also add `mcpServers McpServer[]` relation to the `User` model.

### Step 6: Create `src/lib/mcp/global-config.ts`
Reads MCP server definitions from a JSON config file.
Checked paths (first found wins):
1. `./mcp-servers.json` (project root)
2. `~/.openassistant/mcp-servers.json` (user home)

Format (matches Claude Desktop / OpenClaw style):
```json
{
  "mcpServers": {
    "github": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    },
    "remote-search": {
      "transport": "http",
      "url": "https://search.example.com/mcp"
    }
  }
}
```

### Step 7: Run migration
- `npx prisma db push` to update the schema

---

## Phase 3: Tool Integration

### Step 8: Modify `src/lib/ai/agent.ts`
In the `buildTools()` function, after registering built-in skills and integration tools, add a third section that:
1. Gets the MCP client manager singleton
2. Calls `mcpManager.getToolsForUser(context.userId)` to get all discovered MCP tools
3. For each discovered tool:
   - Converts the JSON Schema `inputSchema` to a Zod schema (using `zod` directly since the schemas are simple key-value objects)
   - Checks `getToolApprovalRequirement(tool)` — if "confirm", wraps the execute with a confirmation marker in the response
   - Creates a Vercel AI SDK `tool()` with the converted schema
   - Prefixes the tool name with `mcp_` to namespace and avoid collisions
   - Adds audit logging with `source: "mcp:{serverId}"` and `action: "mcp_tool_call"`

In `streamAgentResponse()` and `generateAgentResponse()`, add a call to hydrate MCP connections:
```typescript
await mcpManager.hydrateUserConnections(params.userId);
await mcpManager.hydrateGlobalConnections();
```

### Step 9: Add `"mcp_tool_call"` to `AuditAction` union in `src/lib/audit.ts`

---

## Phase 4: API & UI

### Step 10: Create `src/app/api/mcp/route.ts`
- **GET**: List all MCP servers for the user (per-user from DB + global from config file). Include connection status and discovered tools.
- **POST**: Add or update an MCP server config for the current user. Validate fields, upsert to `McpServer` table, attempt connection, return status + discovered tools.
- **DELETE**: Remove an MCP server. Disconnect and delete from DB.

### Step 11: Create `src/app/(dashboard)/mcp/page.tsx`
UI page with:
- Header: "MCP Servers" with description
- Two sections: "Your Servers" (per-user, editable) and "Global Servers" (from config file, read-only)
- Each server card shows: name, transport type (stdio/http), status badge, discovered tool count
- "Add Server" button opens a modal with:
  - Name (required)
  - Transport type toggle (stdio / http)
  - For stdio: command, args (comma-separated), env vars (key=value pairs)
  - For http: URL, optional auth header
  - Connect & Save button
- Clicking a server card expands to show discovered tools with their descriptions and annotation badges (read-only, destructive, etc.)
- Toggle switch to enable/disable each server

### Step 12: Add navigation link
Add "MCP Servers" to the dashboard sidebar/navigation alongside "Integrations" and "Settings". Look at the existing layout/nav component and add the link there.

---

## File Summary

| Action | File | Description |
|--------|------|-------------|
| Create | `src/lib/mcp/types.ts` | MCP type definitions |
| Create | `src/lib/mcp/client.ts` | MCP client manager (connection lifecycle, tool discovery, call routing) |
| Create | `src/lib/mcp/permissions.ts` | Annotation-based permission gating |
| Create | `src/lib/mcp/global-config.ts` | Global config file reader |
| Create | `src/app/api/mcp/route.ts` | REST API for MCP server management |
| Create | `src/app/(dashboard)/mcp/page.tsx` | MCP servers management UI page |
| Edit | `prisma/schema.prisma` | Add McpServer model + User relation |
| Edit | `src/lib/ai/agent.ts` | Add MCP tools to buildTools(), hydrate MCP connections |
| Edit | `src/lib/audit.ts` | Add "mcp_tool_call" audit action |
| Edit | `package.json` | Add @modelcontextprotocol/sdk dependency |
| Edit | Dashboard layout/nav | Add "MCP Servers" navigation link |
