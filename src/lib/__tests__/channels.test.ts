// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockFindUnique,
  mockConversationCreate,
  mockMessageFindMany,
  mockDebug,
  mockInfo,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockConversationCreate: vi.fn(),
  mockMessageFindMany: vi.fn(),
  mockDebug: vi.fn(),
  mockInfo: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    channelLink: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    conversation: {
      create: (...args: unknown[]) => mockConversationCreate(...args),
    },
    message: {
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ debug: mockDebug, info: mockInfo }),
}));

// ---------------------------------------------------------------------------
// Import SUT (after mocks are set up)
// ---------------------------------------------------------------------------

import { resolveConversation, loadConversationHistory } from "@/lib/channels";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// resolveConversation
// ---------------------------------------------------------------------------

describe("resolveConversation", () => {
  it("returns existing conversationId when channel link is found", async () => {
    mockFindUnique.mockResolvedValue({ conversationId: "conv-123" });

    const result = await resolveConversation({
      userId: "u1",
      platform: "slack",
      externalId: "ext-1",
    });

    expect(result).toBe("conv-123");
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        userId_platform_externalId: {
          userId: "u1",
          platform: "slack",
          externalId: "ext-1",
        },
      },
    });
    expect(mockConversationCreate).not.toHaveBeenCalled();
    expect(mockDebug).toHaveBeenCalledWith("existing channel link found", {
      conversationId: "conv-123",
    });
  });

  it("creates new conversation when no channel link exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockConversationCreate.mockResolvedValue({ id: "new-conv-456" });

    const result = await resolveConversation({
      userId: "u2",
      platform: "discord",
      externalId: "ext-2",
    });

    expect(result).toBe("new-conv-456");
    expect(mockConversationCreate).toHaveBeenCalledWith({
      data: {
        userId: "u2",
        title: "discord conversation",
        channelLinks: {
          create: { userId: "u2", platform: "discord", externalId: "ext-2" },
        },
      },
    });
    expect(mockInfo).toHaveBeenCalledWith("conversation created", {
      conversationId: "new-conv-456",
    });
  });

  it("uses custom title when provided", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockConversationCreate.mockResolvedValue({ id: "conv-custom" });

    const result = await resolveConversation({
      userId: "u3",
      platform: "telegram",
      externalId: "ext-3",
      title: "My Custom Chat",
    });

    expect(result).toBe("conv-custom");
    expect(mockConversationCreate).toHaveBeenCalledWith({
      data: {
        userId: "u3",
        title: "My Custom Chat",
        channelLinks: {
          create: { userId: "u3", platform: "telegram", externalId: "ext-3" },
        },
      },
    });
    expect(mockInfo).toHaveBeenCalledWith("creating new conversation", {
      userId: "u3",
      platform: "telegram",
      externalId: "ext-3",
      title: "My Custom Chat",
    });
  });

  it("uses default title '<platform> conversation' when title is not provided", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockConversationCreate.mockResolvedValue({ id: "conv-default" });

    await resolveConversation({
      userId: "u4",
      platform: "whatsapp",
      externalId: "ext-4",
    });

    expect(mockConversationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "whatsapp conversation",
        }),
      }),
    );
    expect(mockInfo).toHaveBeenCalledWith("creating new conversation", {
      userId: "u4",
      platform: "whatsapp",
      externalId: "ext-4",
      title: "whatsapp conversation",
    });
  });

  it("logs debug on entry with params", async () => {
    mockFindUnique.mockResolvedValue({ conversationId: "c1" });

    await resolveConversation({
      userId: "u5",
      platform: "teams",
      externalId: "ext-5",
    });

    expect(mockDebug).toHaveBeenCalledWith("resolveConversation called", {
      userId: "u5",
      platform: "teams",
      externalId: "ext-5",
    });
  });
});

// ---------------------------------------------------------------------------
// loadConversationHistory
// ---------------------------------------------------------------------------

describe("loadConversationHistory", () => {
  it("returns reversed and filtered messages", async () => {
    mockMessageFindMany.mockResolvedValue([
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "Hi there" },
    ]);

    const result = await loadConversationHistory("conv-1");

    // Messages are returned in desc order from DB, reversed to chronological
    expect(result).toEqual([
      { role: "user", content: "Hi there" },
      { role: "assistant", content: "Hello!" },
    ]);
  });

  it("filters out system role messages", async () => {
    mockMessageFindMany.mockResolvedValue([
      { role: "assistant", content: "Response" },
      { role: "system", content: "System prompt" },
      { role: "user", content: "Question" },
    ]);

    const result = await loadConversationHistory("conv-2");

    expect(result).toEqual([
      { role: "user", content: "Question" },
      { role: "assistant", content: "Response" },
    ]);
    expect(result.every((m) => m.role === "user" || m.role === "assistant")).toBe(true);
  });

  it("uses default limit of 50", async () => {
    mockMessageFindMany.mockResolvedValue([]);

    await loadConversationHistory("conv-3");

    expect(mockMessageFindMany).toHaveBeenCalledWith({
      where: { conversationId: "conv-3" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { role: true, content: true },
    });
  });

  it("uses custom limit when provided", async () => {
    mockMessageFindMany.mockResolvedValue([]);

    await loadConversationHistory("conv-4", 10);

    expect(mockMessageFindMany).toHaveBeenCalledWith({
      where: { conversationId: "conv-4" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { role: true, content: true },
    });
  });

  it("logs debug messages for call and result", async () => {
    mockMessageFindMany.mockResolvedValue([
      { role: "user", content: "msg1" },
      { role: "assistant", content: "msg2" },
    ]);

    await loadConversationHistory("conv-5", 25);

    expect(mockDebug).toHaveBeenCalledWith("loadConversationHistory called", {
      conversationId: "conv-5",
      limit: 25,
    });
    expect(mockDebug).toHaveBeenCalledWith("conversation history loaded", {
      messageCount: 2,
    });
  });

  it("returns empty array when no messages exist", async () => {
    mockMessageFindMany.mockResolvedValue([]);

    const result = await loadConversationHistory("conv-empty");

    expect(result).toEqual([]);
  });
});
