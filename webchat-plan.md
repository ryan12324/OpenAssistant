# Webchat Fix Plan

## Current State
The webchat **builds and compiles successfully**. All routes, components, and APIs exist. But several issues prevent it from working smoothly end-to-end.

## Issues to Fix

### 1. Environment Setup (`.env.local`)
**Problem**: No `.env.local` file exists. Without `DATABASE_URL`, `BETTER_AUTH_SECRET`, and an AI provider key, the app crashes at runtime.
**Fix**: Create `.env.local` from `.env.example` with working defaults. Generate a proper auth secret.

### 2. Streaming Parser Misses Tool Calls
**Problem**: `chat-view.tsx` only parses `0:"text"` deltas from the Vercel AI SDK data stream. When the AI uses tools (memory, web search, integrations, MCP), the tool call messages (`9:`, `a:`, `b:` prefixes) are silently ignored. This means:
- Tool calls happen invisibly
- Tool results are not shown
- The user sees gaps in the response or no response at all if the AI only uses tools

**Fix**: Parse the full Vercel AI SDK data stream protocol:
- `0:` → text delta (already handled)
- `9:` → tool call begin (show "Using tool: X...")
- `a:` → tool result (show result)
- `b:` → tool call streaming delta
- `e:` → finish metadata
- `d:` → error

Add a tool call indicator component that shows when tools are being used and their results.

### 3. Sidebar Doesn't Refresh After New Chat
**Problem**: When a new conversation is created, the URL updates via `window.history.replaceState()` but the sidebar doesn't know about the new conversation. The sidebar fetches conversations in a `useEffect` triggered by `pathname`, but `replaceState` doesn't change `pathname`.
**Fix**: Expose a refresh mechanism. Options:
- Use `router.replace()` instead of `window.history.replaceState()` so pathname actually changes
- Or emit a custom event that the sidebar listens for
- Or use a shared state (context) for conversation list

### 4. Conversation Title Generation
**Problem**: New conversations are titled with the first 100 chars of the user's message, which is crude. e.g., "What's the weather in Tokyo and can you also check my calendar for tomorrow..."
**Fix**: After the first assistant response completes, generate a short title using a lightweight LLM call (or just use the AI's first response to extract a 5-word summary). Update the conversation title in the DB.

### 5. Error Messages Lack Detail
**Problem**: All errors show "Sorry, I encountered an error. Please try again." No details about what went wrong (missing API key, rate limit, model not found, etc.).
**Fix**: Parse the error response body from `/api/chat` and display the actual error message. Add specific error handling for common cases (401 = unauthorized, 429 = rate limited, 500 = server error with detail).

### 6. Tool Call UI Component
**Problem**: Even after parsing tool calls from the stream, there's no UI to display them.
**Fix**: Create a `ToolCallIndicator` component that shows:
- Tool name and status (calling/complete/error)
- Collapsible result content
- Visual distinction from regular text (e.g., a bordered card with a wrench icon)

### 7. Conversation Delete Confirmation
**Problem**: The sidebar shows conversations but there's no delete button visible. The API exists (`DELETE /api/conversations`) but the UI doesn't expose it.
**Fix**: Add a hover-revealed delete button (X icon) on conversation items in the sidebar. Add a confirmation step.

### 8. Auto-scroll Improvements
**Problem**: Auto-scroll works but can be jarring when the user has scrolled up to read earlier messages — new content forces them back down.
**Fix**: Only auto-scroll if the user is already near the bottom. Detect scroll position and skip auto-scroll if they've scrolled up more than 100px from the bottom.

## Implementation Order

1. **Environment setup** (`.env.local`) — unblocks everything
2. **Streaming parser** (tool calls) — core chat functionality
3. **Tool call UI** — visual feedback for tool usage
4. **Sidebar refresh** — conversation list stays current
5. **Error messages** — better debugging experience
6. **Title generation** — better conversation labels
7. **Conversation delete** — basic CRUD
8. **Auto-scroll fix** — polish

## Files to Modify

| File | Changes |
|------|---------|
| `.env.local` | Create with working defaults |
| `src/components/chat/chat-view.tsx` | Full stream parser, sidebar refresh, error messages, auto-scroll |
| `src/components/chat/chat-message.tsx` | Tool call display component |
| `src/components/sidebar.tsx` | Delete button, refresh mechanism |
| `src/app/api/chat/route.ts` | Title generation after first response |
