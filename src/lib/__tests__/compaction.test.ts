// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockCount,
  mockFindMany,
  mockFindFirst,
  mockUpdate,
  mockCreate,
  mockDeleteMany,
  mockGenerateText,
  mockResolveModelFromSettings,
  mockMemoryStore,
  mockDebug,
  mockInfo,
  mockWarn,
} = vi.hoisted(() => ({
  mockCount: vi.fn(),
  mockFindMany: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockCreate: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockGenerateText: vi.fn(),
  mockResolveModelFromSettings: vi.fn(),
  mockMemoryStore: vi.fn(),
  mockDebug: vi.fn(),
  mockInfo: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("@/lib/ai/providers", () => ({
  resolveModelFromSettings: (...args: unknown[]) => mockResolveModelFromSettings(...args),
}));

vi.mock("@/lib/rag/memory", () => ({
  memoryManager: {
    store: (...args: unknown[]) => mockMemoryStore(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ debug: mockDebug, info: mockInfo, warn: mockWarn }),
}));

// ---------------------------------------------------------------------------
// Import SUT (after mocks are set up)
// ---------------------------------------------------------------------------

import { maybeCompact, compactConversation } from "@/lib/compaction";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

function makeMessage(id: string, role: string, content: string, source?: string) {
  return { id, role, content, source: source ?? null, createdAt: new Date() };
}

// ---------------------------------------------------------------------------
// Environment variable defaults
// ---------------------------------------------------------------------------

describe("compaction env var defaults", () => {
  it("uses default COMPACTION_THRESHOLD of 80 when env var is not set", async () => {
    // The module reads process.env.COMPACTION_THRESHOLD at load time.
    // When not set, the default is 80. Verify by checking threshold behavior.
    mockCount.mockResolvedValue(80);
    await maybeCompact("conv-default", "user-default");
    // At exactly 80, should NOT trigger compaction
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockDebug).toHaveBeenCalledWith("checked compaction eligibility", {
      conversationId: "conv-default",
      messageCount: 80,
      threshold: Number(process.env.COMPACTION_THRESHOLD ?? "80"),
    });
  });

  it("uses default COMPACTION_KEEP_RECENT of 20 when env var is not set", async () => {
    // Verify KEEP_RECENT defaults to 20 by checking that exactly 20 messages
    // are kept in a compaction run (the rest are summarized).
    const messages = Array.from({ length: 25 }, (_, i) =>
      makeMessage(`m${i}`, "user", `msg ${i}`)
    );
    mockFindMany.mockResolvedValue(messages);
    mockResolveModelFromSettings.mockResolvedValue("test-model");
    mockGenerateText.mockResolvedValue({ text: "Summary." });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
    mockMemoryStore.mockResolvedValue(undefined);
    mockDeleteMany.mockResolvedValue({});

    await compactConversation("conv-keep", "user-keep");

    const keepRecent = Number(process.env.COMPACTION_KEEP_RECENT ?? "20");
    expect(mockDebug).toHaveBeenCalledWith("fetched messages for compaction", {
      conversationId: "conv-keep",
      totalMessages: 25,
      keepRecent,
    });
    // 25 - 20 = 5 messages should be deleted
    const deletedIds = messages.slice(0, 5).map((m) => m.id);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: deletedIds } },
    });
  });
});

// ---------------------------------------------------------------------------
// maybeCompact
// ---------------------------------------------------------------------------

describe("maybeCompact", () => {
  it("does nothing when message count is below threshold (<=80)", async () => {
    mockCount.mockResolvedValue(80);

    await maybeCompact("conv-1", "user-1");

    expect(mockCount).toHaveBeenCalledWith({ where: { conversationId: "conv-1" } });
    expect(mockDebug).toHaveBeenCalledWith("checked compaction eligibility", {
      conversationId: "conv-1",
      messageCount: 80,
      threshold: 80,
    });
    // Should NOT call findMany (compactConversation's first step)
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("triggers compactConversation when count exceeds threshold (>80)", async () => {
    mockCount.mockResolvedValue(81);

    // Set up the full compactConversation flow so it doesn't fail
    const messages = Array.from({ length: 25 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? "user" : "assistant", `msg ${i}`)
    );
    mockFindMany.mockResolvedValue(messages);
    mockResolveModelFromSettings.mockResolvedValue("test-model");
    mockGenerateText.mockResolvedValue({ text: "Summary of conversation." });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
    mockMemoryStore.mockResolvedValue(undefined);
    mockDeleteMany.mockResolvedValue({});

    await maybeCompact("conv-2", "user-2");

    expect(mockInfo).toHaveBeenCalledWith("compaction threshold exceeded, triggering compaction", {
      conversationId: "conv-2",
      messageCount: 81,
      threshold: 80,
    });
    // compactConversation was called (verifiable by findMany being invoked)
    expect(mockFindMany).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// compactConversation
// ---------------------------------------------------------------------------

describe("compactConversation", () => {
  it("returns early when messages <= KEEP_RECENT (20)", async () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMessage(`m${i}`, "user", `msg ${i}`)
    );
    mockFindMany.mockResolvedValue(messages);

    await compactConversation("conv-early", "user-early");

    expect(mockInfo).toHaveBeenCalledWith("starting conversation compaction", {
      conversationId: "conv-early",
      userId: "user-early",
    });
    expect(mockDebug).toHaveBeenCalledWith("fetched messages for compaction", {
      conversationId: "conv-early",
      totalMessages: 20,
      keepRecent: 20,
    });
    // Should NOT proceed to resolve model or generate text
    expect(mockResolveModelFromSettings).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("runs the full compaction flow with new summary when no existing summary exists", async () => {
    const messages = Array.from({ length: 25 }, (_, i) =>
      makeMessage(`m${i}`, i % 2 === 0 ? "user" : "assistant", `message ${i}`)
    );
    mockFindMany.mockResolvedValue(messages);

    const fakeModel = { id: "test-model" };
    mockResolveModelFromSettings.mockResolvedValue(fakeModel);
    mockGenerateText.mockResolvedValue({ text: "Bullet point summary." });
    mockFindFirst.mockResolvedValue(null); // no existing summary
    mockCreate.mockResolvedValue({});
    mockMemoryStore.mockResolvedValue(undefined);
    mockDeleteMany.mockResolvedValue({});

    await compactConversation("conv-full", "user-full");

    // Verify summarization was called with the model
    expect(mockGenerateText).toHaveBeenCalledWith({
      model: fakeModel,
      messages: [
        { role: "system", content: expect.stringContaining("You are a summarizer") },
        { role: "user", content: expect.stringContaining("Summarize this conversation (5 messages)") },
      ],
    });

    // Verify new summary message was created (not updated)
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        conversationId: "conv-full",
        role: "system",
        content: "[Conversation summary — earlier messages compacted]\n\nBullet point summary.",
        metadata: "compaction_summary",
      },
    });
    expect(mockUpdate).not.toHaveBeenCalled();

    // Verify memory store was called
    expect(mockMemoryStore).toHaveBeenCalledWith({
      userId: "user-full",
      content: "Bullet point summary.",
      type: "long_term",
      tags: ["compaction", "conversation_summary"],
      summary: "Compacted 5 messages from conversation.",
    });

    // Verify old messages were deleted (first 5, keeping the last 20)
    const expectedDeletedIds = messages.slice(0, 5).map((m) => m.id);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: expectedDeletedIds } },
    });

    expect(mockInfo).toHaveBeenCalledWith("conversation compaction complete", {
      conversationId: "conv-full",
      deletedMessages: 5,
      keptMessages: 20,
      summaryLength: "Bullet point summary.".length,
    });
  });

  it("updates existing summary when one is found", async () => {
    const messages = Array.from({ length: 30 }, (_, i) =>
      makeMessage(`m${i}`, "user", `message ${i}`)
    );
    mockFindMany.mockResolvedValue(messages);
    mockResolveModelFromSettings.mockResolvedValue("model-x");
    mockGenerateText.mockResolvedValue({ text: "Updated summary text." });
    mockFindFirst.mockResolvedValue({ id: "existing-summary-id" }); // existing summary found
    mockUpdate.mockResolvedValue({});
    mockMemoryStore.mockResolvedValue(undefined);
    mockDeleteMany.mockResolvedValue({});

    await compactConversation("conv-update", "user-update");

    expect(mockDebug).toHaveBeenCalledWith("updating existing summary message", {
      conversationId: "conv-update",
      summaryMessageId: "existing-summary-id",
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "existing-summary-id" },
      data: {
        content: "[Conversation summary — earlier messages compacted]\n\nUpdated summary text.",
      },
    });
    // Should NOT create a new summary
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("formats transcript correctly for messages with source", async () => {
    const messages = [
      makeMessage("m0", "user", "Hello from slack", "slack"),
      makeMessage("m1", "assistant", "Hi there", null),
      ...Array.from({ length: 20 }, (_, i) =>
        makeMessage(`recent${i}`, "user", `recent ${i}`)
      ),
    ];
    mockFindMany.mockResolvedValue(messages);
    mockResolveModelFromSettings.mockResolvedValue("model");
    mockGenerateText.mockResolvedValue({ text: "Summary." });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
    mockMemoryStore.mockResolvedValue(undefined);
    mockDeleteMany.mockResolvedValue({});

    await compactConversation("conv-src", "user-src");

    // Verify the transcript passed to generateText includes the source for message with source
    const generateCall = mockGenerateText.mock.calls[0][0];
    const userMessage = generateCall.messages[1].content;
    expect(userMessage).toContain("user [slack]: Hello from slack");
    expect(userMessage).toContain("assistant: Hi there");
  });

  it("formats transcript correctly for messages without source", async () => {
    const messages = [
      makeMessage("m0", "user", "Hello world", null),
      makeMessage("m1", "assistant", "Greetings", undefined as unknown as string),
      ...Array.from({ length: 20 }, (_, i) =>
        makeMessage(`recent${i}`, "user", `recent ${i}`)
      ),
    ];
    mockFindMany.mockResolvedValue(messages);
    mockResolveModelFromSettings.mockResolvedValue("model");
    mockGenerateText.mockResolvedValue({ text: "Summary." });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
    mockMemoryStore.mockResolvedValue(undefined);
    mockDeleteMany.mockResolvedValue({});

    await compactConversation("conv-nosrc", "user-nosrc");

    const generateCall = mockGenerateText.mock.calls[0][0];
    const userMessage = generateCall.messages[1].content;
    // No source bracket should appear
    expect(userMessage).toContain("user: Hello world");
    expect(userMessage).toContain("assistant: Greetings");
    expect(userMessage).not.toContain("[");
  });

  it("catches and logs warning when memoryManager.store fails with an Error instance", async () => {
    const messages = Array.from({ length: 25 }, (_, i) =>
      makeMessage(`m${i}`, "user", `msg ${i}`)
    );
    mockFindMany.mockResolvedValue(messages);
    mockResolveModelFromSettings.mockResolvedValue("model");
    mockGenerateText.mockResolvedValue({ text: "Summary." });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
    mockMemoryStore.mockRejectedValue(new Error("RAG service unavailable"));
    mockDeleteMany.mockResolvedValue({});

    // Should NOT throw — error is caught
    await compactConversation("conv-err", "user-err");

    expect(mockWarn).toHaveBeenCalledWith("failed to store compaction summary in RAG memory", {
      conversationId: "conv-err",
      userId: "user-err",
      error: "RAG service unavailable",
    });

    // Verify it still deletes old messages after the catch
    expect(mockDeleteMany).toHaveBeenCalled();
  });

  it("catches and logs warning when memoryManager.store fails with a non-Error string", async () => {
    const messages = Array.from({ length: 25 }, (_, i) =>
      makeMessage(`m${i}`, "user", `msg ${i}`)
    );
    mockFindMany.mockResolvedValue(messages);
    mockResolveModelFromSettings.mockResolvedValue("model");
    mockGenerateText.mockResolvedValue({ text: "Summary." });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
    mockMemoryStore.mockRejectedValue("plain string error");
    mockDeleteMany.mockResolvedValue({});

    await compactConversation("conv-str-err", "user-str-err");

    expect(mockWarn).toHaveBeenCalledWith("failed to store compaction summary in RAG memory", {
      conversationId: "conv-str-err",
      userId: "user-str-err",
      error: "plain string error",
    });

    expect(mockDeleteMany).toHaveBeenCalled();
  });

  it("deletes all old messages (those not in the keep-recent window)", async () => {
    const messages = Array.from({ length: 30 }, (_, i) =>
      makeMessage(`msg-${i}`, "user", `content ${i}`)
    );
    mockFindMany.mockResolvedValue(messages);
    mockResolveModelFromSettings.mockResolvedValue("model");
    mockGenerateText.mockResolvedValue({ text: "Summary." });
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({});
    mockMemoryStore.mockResolvedValue(undefined);
    mockDeleteMany.mockResolvedValue({});

    await compactConversation("conv-del", "user-del");

    const expectedIds = messages.slice(0, 10).map((m) => m.id);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: expectedIds } },
    });
  });
});
