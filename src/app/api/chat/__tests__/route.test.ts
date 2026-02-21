import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockRequireSession,
  mockPrisma,
  mockStreamAgentResponse,
  mockMemoryManager,
  mockMaybeCompact,
  mockConvertToModelMessages,
  mockGenerateText,
  mockResolveModelFromSettings,
  mockLog,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockPrisma: {
    conversation: { create: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
  },
  mockStreamAgentResponse: vi.fn(),
  mockMemoryManager: { recall: vi.fn(), store: vi.fn() },
  mockMaybeCompact: vi.fn(),
  mockConvertToModelMessages: vi.fn(),
  mockGenerateText: vi.fn(),
  mockResolveModelFromSettings: vi.fn(),
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockHandleApiError: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }),
}));

vi.mock("@/lib/auth-server", () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/ai/agent", () => ({
  streamAgentResponse: (...args: unknown[]) => mockStreamAgentResponse(...args),
}));

vi.mock("@/lib/rag/memory", () => ({
  memoryManager: mockMemoryManager,
}));

vi.mock("@/lib/compaction", () => ({
  maybeCompact: (...args: unknown[]) => mockMaybeCompact(...args),
}));

vi.mock("ai", () => ({
  convertToModelMessages: (...args: unknown[]) => mockConvertToModelMessages(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("@/lib/ai/providers", () => ({
  resolveModelFromSettings: (...args: unknown[]) => mockResolveModelFromSettings(...args),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

vi.mock("@/lib/api-utils", () => ({
  handleApiError: (...args: unknown[]) => mockHandleApiError(...args),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { POST } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Request;
}

function makeStreamResult(textValue: string) {
  let resolveText: (val: string) => void;
  const textPromise = new Promise<string>((resolve) => {
    resolveText = resolve;
  });
  // Add .catch to textPromise.then chain to match source code's .catch handler
  const originalThen = textPromise.then.bind(textPromise);
  return {
    result: {
      text: textPromise,
      toUIMessageStreamResponse: vi.fn(({ headers }: { headers: Record<string, string> }) =>
        new Response("stream-body", { headers })
      ),
    },
    resolveText: (val?: string) => resolveText!(val ?? textValue),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockConvertToModelMessages.mockReturnValue([{ role: "user", content: "hi" }]);
  mockMemoryManager.recall.mockResolvedValue("memory context");
  mockMemoryManager.store.mockResolvedValue(undefined);
  mockMaybeCompact.mockResolvedValue(undefined);
  mockResolveModelFromSettings.mockResolvedValue("mock-model");
  mockGenerateText.mockResolvedValue({ text: "Generated Title" });
});

describe("POST /api/chat", () => {
  it("returns 401 when requireSession throws Unauthorized", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));

    const req = makeRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }] });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when messages array is missing", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({});
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Messages are required" });
  });

  it("returns 400 when messages array is empty", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });

    const req = makeRequest({ messages: [] });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Messages are required" });
  });

  it("creates a new conversation when no conversationId is provided", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-new" });
    mockPrisma.message.create.mockResolvedValue({});

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "Hello world" }] }],
    });
    const res = await POST(req as any);

    expect(res.headers.get("X-Conversation-Id")).toBe("conv-new");
    expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: "Hello world",
      },
    });

    // Trigger text promise to cover the .then() branch
    resolveText("AI response");
    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 50));

    expect(mockPrisma.message.create).toHaveBeenCalledTimes(2); // user + assistant
    expect(mockMemoryManager.store).toHaveBeenCalled();
    expect(mockGenerateText).toHaveBeenCalled(); // new conversation title generation
    expect(mockMaybeCompact).toHaveBeenCalledWith("conv-new", "user-1");
  });

  it("uses existing conversationId when provided", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create.mockResolvedValue({});

    const { result, resolveText } = makeStreamResult("response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "follow up" }] }],
      conversationId: "conv-existing",
    });
    const res = await POST(req as any);

    expect(res.headers.get("X-Conversation-Id")).toBe("conv-existing");
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();

    resolveText("response");
    await new Promise((r) => setTimeout(r, 50));

    // No title generation for existing conversations
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("uses empty string for title when first message content is empty", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-1" });
    mockPrisma.message.create.mockResolvedValue({});

    const { result, resolveText } = makeStreamResult("");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "" }] }],
    });
    await POST(req as any);

    expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: "New Conversation",
      },
    });

    resolveText("");
    await new Promise((r) => setTimeout(r, 50));
  });

  it("does not save user message when last message role is not user", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-1" });

    const { result, resolveText } = makeStreamResult("");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "assistant", parts: [{ type: "text", text: "I said something" }] }],
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();

    resolveText("");
    await new Promise((r) => setTimeout(r, 50));
  });

  it("handles memory recall failure gracefully", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-1" });
    mockPrisma.message.create.mockResolvedValue({});
    mockMemoryManager.recall.mockRejectedValue(new Error("RAG down"));

    const { result, resolveText } = makeStreamResult("");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(mockLog.warn).toHaveBeenCalledWith("Memory recall failed", expect.any(Object));

    resolveText("");
    await new Promise((r) => setTimeout(r, 50));
  });

  it("handles memory recall failure with non-Error", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-1" });
    mockPrisma.message.create.mockResolvedValue({});
    mockMemoryManager.recall.mockRejectedValue("string error");

    const { result, resolveText } = makeStreamResult("");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(mockLog.warn).toHaveBeenCalledWith("Memory recall failed", expect.objectContaining({
      error: "string error",
    }));

    resolveText("");
    await new Promise((r) => setTimeout(r, 50));
  });

  it("handles assistant message save failure", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create
      .mockResolvedValueOnce({}) // user message save succeeds
      .mockRejectedValueOnce(new Error("DB write failed")); // assistant message save fails

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      conversationId: "conv-1",
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);

    resolveText("AI response");
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLog.error).toHaveBeenCalledWith("Failed to save assistant message", expect.any(Object));
  });

  it("handles assistant message save failure with non-Error", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce("string error");

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      conversationId: "conv-1",
    });
    await POST(req as any);

    resolveText("AI response");
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLog.error).toHaveBeenCalledWith("Failed to save assistant message", expect.objectContaining({
      error: "string error",
    }));
  });

  it("handles memory store failure gracefully", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create.mockResolvedValue({});
    mockMemoryManager.store.mockRejectedValue(new Error("store fail"));

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      conversationId: "conv-1",
    });
    await POST(req as any);

    resolveText("AI response");
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLog.warn).toHaveBeenCalledWith("Memory store failed", expect.any(Object));
  });

  it("handles memory store failure with non-Error", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create.mockResolvedValue({});
    mockMemoryManager.store.mockRejectedValue("store string error");

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      conversationId: "conv-1",
    });
    await POST(req as any);

    resolveText("AI response");
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLog.warn).toHaveBeenCalledWith("Memory store failed", expect.objectContaining({
      error: "store string error",
    }));
  });

  it("handles title generation failure for new conversations", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-new" });
    mockPrisma.message.create.mockResolvedValue({});
    mockGenerateText.mockRejectedValue(new Error("title gen fail"));

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });
    await POST(req as any);

    resolveText("AI response");
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLog.warn).toHaveBeenCalledWith("Title generation failed", expect.any(Object));
  });

  it("handles title generation failure with non-Error", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-new" });
    mockPrisma.message.create.mockResolvedValue({});
    mockGenerateText.mockRejectedValue("title gen string error");

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });
    await POST(req as any);

    resolveText("AI response");
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLog.warn).toHaveBeenCalledWith("Title generation failed", expect.objectContaining({
      error: "title gen string error",
    }));
  });

  it("does not update title when generated title is empty", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-new" });
    mockPrisma.message.create.mockResolvedValue({});
    mockGenerateText.mockResolvedValue({ text: "   " });

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });
    await POST(req as any);

    resolveText("AI response");
    await new Promise((r) => setTimeout(r, 50));

    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it("handles compaction failure gracefully", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create.mockResolvedValue({});
    mockMaybeCompact.mockRejectedValue(new Error("compact fail"));

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      conversationId: "conv-1",
    });
    await POST(req as any);

    resolveText("AI response");
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLog.warn).toHaveBeenCalledWith("Compaction failed", expect.any(Object));
  });

  it("handles compaction failure with non-Error", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create.mockResolvedValue({});
    mockMaybeCompact.mockRejectedValue("compact string error");

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      conversationId: "conv-1",
    });
    await POST(req as any);

    resolveText("AI response");
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLog.warn).toHaveBeenCalledWith("Compaction failed", expect.objectContaining({
      error: "compact string error",
    }));
  });

  it("does not save assistant message or perform post-processing when text is empty", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create.mockResolvedValue({});

    const { result, resolveText } = makeStreamResult("");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      conversationId: "conv-1",
    });
    await POST(req as any);

    resolveText("");
    await new Promise((r) => setTimeout(r, 50));

    // Only the user message save, not assistant
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
    expect(mockMemoryManager.store).not.toHaveBeenCalled();
    expect(mockMaybeCompact).not.toHaveBeenCalled();
  });

  it("returns 500 for generic errors", async () => {
    mockRequireSession.mockRejectedValue(new Error("DB connection failed"));

    const req = makeRequest({ messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }] });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("returns 500 for non-Error thrown values", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    // Make req.json() fail by passing invalid input
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
  });

  it("truncates first message content to 100 chars for conversation title", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    const longContent = "A".repeat(200);
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-new" });
    mockPrisma.message.create.mockResolvedValue({});

    const { result, resolveText } = makeStreamResult("");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: longContent }] }],
    });
    await POST(req as any);

    expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: "A".repeat(100),
      },
    });

    resolveText("");
    await new Promise((r) => setTimeout(r, 50));
  });

  it("passes memoryContext as undefined when recall returns empty string", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create.mockResolvedValue({});
    mockMemoryManager.recall.mockResolvedValue("");

    const { result, resolveText } = makeStreamResult("");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      conversationId: "conv-1",
    });
    await POST(req as any);

    expect(mockStreamAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({ memoryContext: undefined })
    );

    resolveText("");
    await new Promise((r) => setTimeout(r, 50));
  });

  it("handles null text in stream result (text?.length ?? 0 branch)", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create.mockResolvedValue({});

    // Create a stream result that resolves with null to cover text?.length ?? 0
    let resolveText: (val: unknown) => void;
    const textPromise = new Promise<string>((resolve) => {
      resolveText = resolve as (val: unknown) => void;
    });
    const result = {
      text: textPromise,
      toUIMessageStreamResponse: vi.fn(({ headers }: { headers: Record<string, string> }) =>
        new Response("stream-body", { headers })
      ),
    };
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      conversationId: "conv-1",
    });
    await POST(req as any);

    // Resolve with null to trigger the ?? 0 branch for text?.length
    resolveText!(null);
    await new Promise((r) => setTimeout(r, 50));

    // Null text should not save assistant message
    expect(mockLog.info).toHaveBeenCalledWith("AI stream complete", expect.objectContaining({
      responseLength: 0,
    }));
  });

  it("returns 500 with non-Error thrown value in catch block", async () => {
    // We need the outer catch to receive a non-Error to cover the handleApiError path
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    // Make prisma.conversation.create throw a non-Error value
    mockPrisma.conversation.create.mockRejectedValue("non-error-string");

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
    });
    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Internal server error" });
    expect(mockHandleApiError).toHaveBeenCalledWith("non-error-string", "process chat");
  });

  it("handles empty lastMessage content in text promise branch", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-new" });
    mockPrisma.message.create.mockResolvedValue({});

    const { result, resolveText } = makeStreamResult("AI response");
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [
        { role: "user", parts: [{ type: "text", text: "" }] },
      ],
    });
    await POST(req as any);

    resolveText("AI response");
    await new Promise((r) => setTimeout(r, 50));

    // memoryManager.store should have been called with empty userContent
    expect(mockMemoryManager.store).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('User asked: ""'),
      })
    );
  });

  it("catches errors in the fire-and-forget .then chain via .catch", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.message.create.mockResolvedValue({});

    // Create a text promise that rejects to trigger the .catch handler
    const textPromise = Promise.reject(new Error("stream exploded"));
    const result = {
      text: textPromise,
      toUIMessageStreamResponse: vi.fn(({ headers }: { headers: Record<string, string> }) =>
        new Response("stream-body", { headers })
      ),
    };
    mockStreamAgentResponse.mockResolvedValue(result);

    const req = makeRequest({
      messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      conversationId: "conv-1",
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);

    // Allow microtasks to flush so the .catch handler runs
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLog.error).toHaveBeenCalledWith(
      "Post-stream processing failed",
      expect.objectContaining({ error: expect.any(Error) })
    );
  });
});
