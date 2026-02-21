// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockMessageCreate,
  mockResolveConversation,
  mockLoadConversationHistory,
  mockGenerateAgentResponse,
  mockMemoryRecall,
  mockMemoryStore,
  mockMaybeCompact,
  mockCompactConversation,
  mockAudit,
  mockRegisterHandler,
  mockStartPoller,
  mockDebug,
  mockInfo,
  mockWarn,
  mockError,
  mockChild,
} = vi.hoisted(() => {
  const mockDebug = vi.fn();
  const mockInfo = vi.fn();
  const mockWarn = vi.fn();
  const mockError = vi.fn();
  const mockChild = vi.fn();

  return {
    mockMessageCreate: vi.fn(),
    mockResolveConversation: vi.fn(),
    mockLoadConversationHistory: vi.fn(),
    mockGenerateAgentResponse: vi.fn(),
    mockMemoryRecall: vi.fn(),
    mockMemoryStore: vi.fn(),
    mockMaybeCompact: vi.fn(),
    mockCompactConversation: vi.fn(),
    mockAudit: vi.fn(),
    mockRegisterHandler: vi.fn(),
    mockStartPoller: vi.fn(),
    mockDebug,
    mockInfo,
    mockWarn,
    mockError,
    mockChild,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      create: (...args: unknown[]) => mockMessageCreate(...args),
    },
  },
}));

vi.mock("@/lib/channels", () => ({
  resolveConversation: (...args: unknown[]) => mockResolveConversation(...args),
  loadConversationHistory: (...args: unknown[]) => mockLoadConversationHistory(...args),
}));

vi.mock("@/lib/ai/agent", () => ({
  generateAgentResponse: (...args: unknown[]) => mockGenerateAgentResponse(...args),
}));

vi.mock("@/lib/rag/memory", () => ({
  memoryManager: {
    recall: (...args: unknown[]) => mockMemoryRecall(...args),
    store: (...args: unknown[]) => mockMemoryStore(...args),
  },
}));

vi.mock("@/lib/compaction", () => ({
  maybeCompact: (...args: unknown[]) => mockMaybeCompact(...args),
  compactConversation: (...args: unknown[]) => mockCompactConversation(...args),
}));

vi.mock("@/lib/audit", () => ({
  audit: (...args: unknown[]) => mockAudit(...args),
}));

vi.mock("@/lib/queue", () => ({
  registerHandler: (...args: unknown[]) => mockRegisterHandler(...args),
  startPoller: (...args: unknown[]) => mockStartPoller(...args),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => {
    const logObj = { debug: mockDebug, info: mockInfo, warn: mockWarn, error: mockError, child: mockChild };
    mockChild.mockReturnValue(logObj);
    return logObj;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    source: "telegram",
    senderId: "sender-123",
    senderName: "Alice",
    content: "Hello, AI!",
    externalChatId: "ext-chat-456",
    metadata: { key: "value" },
    userId: "user-1",
    definitionName: "TelegramBot",
    storedConfig: {},
    ...overrides,
  };
}

function setupHappyPath(aiReply: string | null = "AI response here") {
  mockResolveConversation.mockResolvedValue("conv-abc");
  mockLoadConversationHistory.mockResolvedValue([
    { role: "user", content: "earlier question" },
    { role: "assistant", content: "earlier answer" },
  ]);
  mockMessageCreate.mockResolvedValue({});
  mockMemoryRecall.mockResolvedValue("some memory context");
  mockGenerateAgentResponse.mockResolvedValue(aiReply);
  mockMemoryStore.mockResolvedValue(undefined);
  mockMaybeCompact.mockResolvedValue(undefined);
  mockAudit.mockReturnValue(undefined);
}

// ---------------------------------------------------------------------------
// processInboundMessage
// ---------------------------------------------------------------------------

describe("processInboundMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the full happy path with aiReply", async () => {
    setupHappyPath("Hello back!");
    const { processInboundMessage } = await import("@/lib/worker");

    const result = await processInboundMessage(makePayload() as any);

    expect(result).toEqual({ reply: "Hello back!", conversationId: "conv-abc" });

    // Verify conversation resolution with senderName title
    expect(mockResolveConversation).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "telegram",
      externalId: "ext-chat-456",
      title: "TelegramBot: Alice",
    });

    // Verify inbound message saved with metadata
    expect(mockMessageCreate).toHaveBeenCalledWith({
      data: {
        conversationId: "conv-abc",
        role: "user",
        content: "Hello, AI!",
        source: "telegram",
        metadata: JSON.stringify({ key: "value" }),
      },
    });

    // Verify AI response generation
    expect(mockGenerateAgentResponse).toHaveBeenCalledWith({
      messages: [
        { role: "user", content: "earlier question" },
        { role: "assistant", content: "earlier answer" },
        { role: "user", content: "Hello, AI!" },
      ],
      userId: "user-1",
      conversationId: "conv-abc",
      memoryContext: "some memory context",
    });

    // Verify audit was called
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "outbound_reply",
        source: "telegram",
      })
    );

    // Verify assistant response saved
    expect(mockMessageCreate).toHaveBeenCalledWith({
      data: {
        conversationId: "conv-abc",
        role: "assistant",
        content: "Hello back!",
        source: "telegram",
      },
    });

    // Verify short-term memory stored
    expect(mockMemoryStore).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "short_term",
      })
    );

    // Verify compaction was checked
    expect(mockMaybeCompact).toHaveBeenCalledWith("conv-abc", "user-1");
  });

  it("does not save assistant response or store memory when aiReply is null", async () => {
    setupHappyPath(null);
    const { processInboundMessage } = await import("@/lib/worker");

    const result = await processInboundMessage(makePayload() as any);

    expect(result).toEqual({ reply: null, conversationId: "conv-abc" });

    // Should only create the inbound user message, NOT the assistant message
    expect(mockMessageCreate).toHaveBeenCalledTimes(1);
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "user" }),
      })
    );

    // Should not store short-term memory
    expect(mockMemoryStore).not.toHaveBeenCalled();
  });

  it("uses externalChatId as chatId when provided", async () => {
    setupHappyPath();
    const { processInboundMessage } = await import("@/lib/worker");

    await processInboundMessage(makePayload({ externalChatId: "ext-999" }) as any);

    expect(mockResolveConversation).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "ext-999" })
    );
  });

  it("falls back to senderId as chatId when externalChatId is not provided", async () => {
    setupHappyPath();
    const { processInboundMessage } = await import("@/lib/worker");

    await processInboundMessage(makePayload({ externalChatId: undefined }) as any);

    expect(mockResolveConversation).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "sender-123" })
    );
  });

  it("uses senderName in conversation title when provided", async () => {
    setupHappyPath();
    const { processInboundMessage } = await import("@/lib/worker");

    await processInboundMessage(makePayload({ senderName: "Bob" }) as any);

    expect(mockResolveConversation).toHaveBeenCalledWith(
      expect.objectContaining({ title: "TelegramBot: Bob" })
    );
  });

  it("uses generic title when senderName is not provided", async () => {
    setupHappyPath();
    const { processInboundMessage } = await import("@/lib/worker");

    await processInboundMessage(makePayload({ senderName: undefined }) as any);

    expect(mockResolveConversation).toHaveBeenCalledWith(
      expect.objectContaining({ title: "TelegramBot conversation" })
    );
  });

  it("stringifies metadata when provided", async () => {
    setupHappyPath();
    const { processInboundMessage } = await import("@/lib/worker");

    await processInboundMessage(makePayload({ metadata: { foo: "bar" } }) as any);

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: JSON.stringify({ foo: "bar" }) }),
      })
    );
  });

  it("sets metadata to null when not provided", async () => {
    setupHappyPath();
    const { processInboundMessage } = await import("@/lib/worker");

    await processInboundMessage(makePayload({ metadata: undefined }) as any);

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: null }),
      })
    );
  });

  it("catches memoryManager.recall failure and continues", async () => {
    setupHappyPath();
    mockMemoryRecall.mockRejectedValue(new Error("recall failed"));
    const { processInboundMessage } = await import("@/lib/worker");

    const result = await processInboundMessage(makePayload() as any);

    expect(result.conversationId).toBe("conv-abc");
    expect(mockWarn).toHaveBeenCalledWith(
      "Memory recall failed (best-effort)",
      expect.objectContaining({ error: "Error: recall failed" })
    );
    // AI response should still be generated (memoryContext will be undefined)
    expect(mockGenerateAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({ memoryContext: undefined })
    );
  });

  it("catches memoryManager.store failure and continues", async () => {
    setupHappyPath("reply text");
    mockMemoryStore.mockRejectedValue(new Error("store failed"));
    const { processInboundMessage } = await import("@/lib/worker");

    const result = await processInboundMessage(makePayload() as any);

    expect(result).toEqual({ reply: "reply text", conversationId: "conv-abc" });
    expect(mockWarn).toHaveBeenCalledWith(
      "Memory store failed (best-effort)",
      expect.objectContaining({ error: "Error: store failed" })
    );
  });

  it("catches maybeCompact failure and continues", async () => {
    setupHappyPath("reply");
    mockMaybeCompact.mockRejectedValue(new Error("compaction failed"));
    const { processInboundMessage } = await import("@/lib/worker");

    const result = await processInboundMessage(makePayload() as any);

    expect(result).toEqual({ reply: "reply", conversationId: "conv-abc" });
    expect(mockWarn).toHaveBeenCalledWith(
      "Compaction check failed (best-effort)",
      expect.objectContaining({ error: "Error: compaction failed" })
    );
  });

  it("builds memory query from last 2 user messages in history plus current content", async () => {
    mockResolveConversation.mockResolvedValue("conv-mem");
    mockLoadConversationHistory.mockResolvedValue([
      { role: "user", content: "first" },
      { role: "assistant", content: "reply1" },
      { role: "user", content: "second" },
      { role: "assistant", content: "reply2" },
      { role: "user", content: "third" },
    ]);
    mockMessageCreate.mockResolvedValue({});
    mockMemoryRecall.mockResolvedValue("context");
    mockGenerateAgentResponse.mockResolvedValue(null);
    mockMaybeCompact.mockResolvedValue(undefined);
    mockAudit.mockReturnValue(undefined);

    const { processInboundMessage } = await import("@/lib/worker");

    await processInboundMessage(makePayload({ content: "fourth" }) as any);

    // user messages in history: "first", "second", "third" — slice(-2) gives "second", "third"
    // plus current content "fourth"
    expect(mockMemoryRecall).toHaveBeenCalledWith({
      userId: "user-1",
      query: "second third fourth",
      limit: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// initWorker (requires fresh module state)
// ---------------------------------------------------------------------------

describe("initWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("registers handler and starts poller on first call", async () => {
    const { initWorker } = await import("@/lib/worker");

    initWorker();

    expect(mockRegisterHandler).toHaveBeenCalledTimes(1);
    expect(mockRegisterHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(mockStartPoller).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith("Background job worker started");
  });

  it("skips registration on second call (already initialized)", async () => {
    const { initWorker } = await import("@/lib/worker");

    initWorker(); // first call
    vi.clearAllMocks();
    initWorker(); // second call

    expect(mockRegisterHandler).not.toHaveBeenCalled();
    expect(mockStartPoller).not.toHaveBeenCalled();
    expect(mockDebug).toHaveBeenCalledWith("Worker already initialized, skipping");
  });
});

// ---------------------------------------------------------------------------
// handleJob (accessed via the registered handler)
// ---------------------------------------------------------------------------

describe("handleJob (via registered handler)", () => {
  let handleJob: (type: string, payload: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const { initWorker } = await import("@/lib/worker");
    initWorker();

    // Grab the handler that was passed to registerHandler
    handleJob = mockRegisterHandler.mock.calls[0][0];
  });

  it("dispatches inbound_message to processInboundMessage", async () => {
    setupHappyPath("Hi!");

    const payload = makePayload();
    const result = await handleJob("inbound_message", payload);

    expect(result).toEqual({ reply: "Hi!", conversationId: "conv-abc" });
    expect(mockDebug).toHaveBeenCalledWith("Dispatching job", { type: "inbound_message" });
  });

  it("dispatches compact_conversation to processCompaction", async () => {
    mockCompactConversation.mockResolvedValue(undefined);

    const result = await handleJob("compact_conversation", {
      conversationId: "conv-compact",
      userId: "user-compact",
    });

    expect(result).toEqual({ compacted: true });
    expect(mockCompactConversation).toHaveBeenCalledWith("conv-compact", "user-compact");
    expect(mockInfo).toHaveBeenCalledWith("Starting conversation compaction", {
      conversationId: "conv-compact",
      userId: "user-compact",
    });
    expect(mockInfo).toHaveBeenCalledWith("Conversation compaction complete", {
      conversationId: "conv-compact",
      userId: "user-compact",
    });
  });

  it("throws for unknown job type", async () => {
    await expect(handleJob("unknown_type", {})).rejects.toThrow("Unknown job type: unknown_type");
    expect(mockError).toHaveBeenCalledWith("Unknown job type", { type: "unknown_type" });
  });
});
