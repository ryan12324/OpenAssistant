import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockPrisma,
  mockIntegrationRegistry,
  mockProcessInboundAttachments,
  mockFormatFileResults,
  mockEnqueue,
  mockAudit,
  mockLog,
  mockProcessInboundMessage,
} = vi.hoisted(() => ({
  mockPrisma: {
    skillConfig: { findFirst: vi.fn() },
  },
  mockIntegrationRegistry: {
    getDefinition: vi.fn(),
  },
  mockProcessInboundAttachments: vi.fn(),
  mockFormatFileResults: vi.fn(),
  mockEnqueue: vi.fn(),
  mockAudit: vi.fn(),
  mockLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockProcessInboundMessage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/integrations", () => ({
  integrationRegistry: mockIntegrationRegistry,
}));

vi.mock("@/lib/integrations/chat/file-handler", () => ({
  processInboundAttachments: (...args: unknown[]) => mockProcessInboundAttachments(...args),
  formatFileResults: (...args: unknown[]) => mockFormatFileResults(...args),
}));

vi.mock("@/lib/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock("@/lib/audit", () => ({
  audit: (...args: unknown[]) => mockAudit(...args),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => mockLog,
}));

vi.mock("@/lib/worker", () => ({
  processInboundMessage: (...args: unknown[]) => mockProcessInboundMessage(...args),
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>, params?: string): NextRequest {
  const url = params
    ? `http://localhost/api/integrations/webhook?${params}`
    : "http://localhost/api/integrations/webhook";
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/integrations/webhook", () => {
  const validBody = {
    source: "telegram",
    secret: "webhook-secret-123",
    senderId: "sender-1",
    senderName: "John",
    content: "Hello from Telegram",
    externalChatId: "chat-123",
  };

  function setupValidConfig() {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Telegram" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "webhook-secret-123" }),
      enabled: true,
    });
  }

  it("processes a message asynchronously (enqueue)", async () => {
    setupValidConfig();
    mockEnqueue.mockResolvedValue("job-1");

    const req = makeRequest(validBody);
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.jobId).toBe("job-1");
    expect(json.message).toContain("John");
    expect(json.message).toContain("Telegram");
    expect(mockEnqueue).toHaveBeenCalledWith("inbound_message", expect.any(Object), "user-1");
    expect(mockAudit).toHaveBeenCalled();
  });

  it("processes a message synchronously when ?sync=true", async () => {
    setupValidConfig();
    mockProcessInboundMessage.mockResolvedValue({ reply: "AI says hi!" });

    const req = makeRequest(validBody, "sync=true");
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.reply).toBe("AI says hi!");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("processes attachments when present", async () => {
    setupValidConfig();
    mockEnqueue.mockResolvedValue("job-2");
    const fileResults = [{ success: true, docId: "doc-1" }];
    mockProcessInboundAttachments.mockResolvedValue(fileResults);
    mockFormatFileResults.mockReturnValue("1 file processed");

    const req = makeRequest({
      ...validBody,
      attachments: [{ url: "http://file.test/doc.pdf", mimeType: "application/pdf" }],
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.filesProcessed).toBe(1);
    expect(json.fileSummary).toBe("1 file processed");
    expect(mockProcessInboundAttachments).toHaveBeenCalled();
  });

  it("returns 400 when source is missing", async () => {
    const req = makeRequest({ secret: "abc", senderId: "s1", content: "hi" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Missing required fields");
  });

  it("returns 400 when secret is missing", async () => {
    const req = makeRequest({ source: "telegram", senderId: "s1", content: "hi" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain("Missing required fields");
  });

  it("returns 404 when integration source is unknown", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue(null);

    const req = makeRequest({ source: "unknown", secret: "abc", senderId: "s1", content: "hi" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toContain("Unknown integration");
  });

  it("returns 403 when skill config not found", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Telegram" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue(null);

    const req = makeRequest({ source: "telegram", secret: "abc", senderId: "s1", content: "hi" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain("not configured or enabled");
  });

  it("returns 403 when webhook secret does not match", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Telegram" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "correct-secret" }),
    });

    const req = makeRequest({ source: "telegram", secret: "wrong-secret", senderId: "s1", content: "hi" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Invalid webhook secret");
  });

  it("returns 403 when config has no webhook secret", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Telegram" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({}),
    });

    const req = makeRequest({ source: "telegram", secret: "any", senderId: "s1", content: "hi" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Invalid webhook secret");
  });

  it("uses signingSecret as fallback for webhook secret", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Slack" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ signingSecret: "signing-123" }),
    });
    mockEnqueue.mockResolvedValue("job-3");

    const req = makeRequest({
      source: "slack",
      secret: "signing-123",
      senderId: "s1",
      content: "hi",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it("uses appPassword as fallback for webhook secret", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Teams" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ appPassword: "app-pass-123" }),
    });
    mockEnqueue.mockResolvedValue("job-4");

    const req = makeRequest({
      source: "teams",
      secret: "app-pass-123",
      senderId: "s1",
      content: "hi",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it("handles null config on skill config", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Test" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: null,
    });

    const req = makeRequest({ source: "test", secret: "abc", senderId: "s1", content: "hi" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("Invalid webhook secret");
  });

  it("handles message with no content (no enqueue or sync)", async () => {
    setupValidConfig();

    const req = makeRequest({
      source: "telegram",
      secret: "webhook-secret-123",
      senderId: "sender-1",
      senderName: "John",
      content: "",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.jobId).toBeUndefined();
    expect(json.reply).toBeUndefined();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("uses senderId in message when senderName is not provided", async () => {
    setupValidConfig();
    mockEnqueue.mockResolvedValue("job-5");

    const req = makeRequest({
      source: "telegram",
      secret: "webhook-secret-123",
      senderId: "sender-1",
      content: "hello",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.message).toContain("sender-1");
  });

  it("returns platform headers for slack", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Slack" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws", botToken: "xoxb-token" }),
    });
    const fileResults = [{ success: true }];
    mockProcessInboundAttachments.mockResolvedValue(fileResults);
    mockFormatFileResults.mockReturnValue("done");
    mockEnqueue.mockResolvedValue("job-6");

    const req = makeRequest({
      source: "slack",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bearer xoxb-token" },
      })
    );
  });

  it("returns platform headers for whatsapp", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "WhatsApp" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws", accessToken: "wa-token" }),
    });
    mockProcessInboundAttachments.mockResolvedValue([]);
    mockFormatFileResults.mockReturnValue("");
    mockEnqueue.mockResolvedValue("job-7");

    const req = makeRequest({
      source: "whatsapp",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bearer wa-token" },
      })
    );
  });

  it("returns platform headers for discord", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Discord" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws", botToken: "disc-token" }),
    });
    mockProcessInboundAttachments.mockResolvedValue([]);
    mockFormatFileResults.mockReturnValue("");
    mockEnqueue.mockResolvedValue("job-8");

    const req = makeRequest({
      source: "discord",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bot disc-token" },
      })
    );
  });

  it("returns platform headers for matrix", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Matrix" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws", accessToken: "mx-token" }),
    });
    mockProcessInboundAttachments.mockResolvedValue([]);
    mockFormatFileResults.mockReturnValue("");
    mockEnqueue.mockResolvedValue("job-9");

    const req = makeRequest({
      source: "matrix",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bearer mx-token" },
      })
    );
  });

  it("returns platform headers for teams", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Teams" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws", accessToken: "teams-token" }),
    });
    mockProcessInboundAttachments.mockResolvedValue([]);
    mockFormatFileResults.mockReturnValue("");
    mockEnqueue.mockResolvedValue("job-10");

    const req = makeRequest({
      source: "teams",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bearer teams-token" },
      })
    );
  });

  it("returns empty headers for unknown platform", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Custom" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws" }),
    });
    mockProcessInboundAttachments.mockResolvedValue([]);
    mockFormatFileResults.mockReturnValue("");
    mockEnqueue.mockResolvedValue("job-11");

    const req = makeRequest({
      source: "custom",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {},
      })
    );
  });

  it("returns empty headers when platform config has no token", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Slack" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws" }),
    });
    mockProcessInboundAttachments.mockResolvedValue([]);
    mockFormatFileResults.mockReturnValue("");
    mockEnqueue.mockResolvedValue("job-12");

    const req = makeRequest({
      source: "slack",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {},
      })
    );
  });

  it("returns 500 on generic error with Error instance", async () => {
    const req = new NextRequest("http://localhost/api/integrations/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json{{{",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(typeof json.error).toBe("string");
  });

  it("returns 500 with fallback message for non-Error throws", async () => {
    // We need to make something throw a non-Error after the json parse succeeds
    // The easiest approach: getDefinition throws a non-Error
    mockIntegrationRegistry.getDefinition.mockImplementation(() => {
      throw "string error";
    });

    const req = makeRequest({ source: "test", secret: "abc", senderId: "s1", content: "hi" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Webhook processing failed");
  });

  it("handles undefined content (content?.length ?? 0 branch)", async () => {
    setupValidConfig();
    // Send a body with no content field at all — content is undefined
    const req = makeRequest({
      source: "telegram",
      secret: "webhook-secret-123",
      senderId: "sender-1",
      senderName: "John",
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    // No enqueue or sync processing because content is falsy
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(
      "Inbound webhook received",
      expect.objectContaining({ contentLength: 0 })
    );
  });

  it("returns empty headers for whatsapp without accessToken", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "WhatsApp" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws" }),
    });
    mockProcessInboundAttachments.mockResolvedValue([]);
    mockFormatFileResults.mockReturnValue("");
    mockEnqueue.mockResolvedValue("job-wa");

    const req = makeRequest({
      source: "whatsapp",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {},
      })
    );
  });

  it("returns empty headers for discord without botToken", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Discord" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws" }),
    });
    mockProcessInboundAttachments.mockResolvedValue([]);
    mockFormatFileResults.mockReturnValue("");
    mockEnqueue.mockResolvedValue("job-disc");

    const req = makeRequest({
      source: "discord",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {},
      })
    );
  });

  it("returns empty headers for matrix without accessToken", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Matrix" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws" }),
    });
    mockProcessInboundAttachments.mockResolvedValue([]);
    mockFormatFileResults.mockReturnValue("");
    mockEnqueue.mockResolvedValue("job-mx");

    const req = makeRequest({
      source: "matrix",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {},
      })
    );
  });

  it("returns empty headers for teams without accessToken", async () => {
    mockIntegrationRegistry.getDefinition.mockReturnValue({ name: "Teams" });
    mockPrisma.skillConfig.findFirst.mockResolvedValue({
      userId: "user-1",
      config: JSON.stringify({ webhookSecret: "ws" }),
    });
    mockProcessInboundAttachments.mockResolvedValue([]);
    mockFormatFileResults.mockReturnValue("");
    mockEnqueue.mockResolvedValue("job-teams");

    const req = makeRequest({
      source: "teams",
      secret: "ws",
      senderId: "s1",
      content: "hi",
      attachments: [{ url: "http://file.test/doc.pdf" }],
    });
    await POST(req);

    expect(mockProcessInboundAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {},
      })
    );
  });

  it("handles sync processing with no reply", async () => {
    setupValidConfig();
    mockProcessInboundMessage.mockResolvedValue({ reply: undefined });

    const req = makeRequest(validBody, "sync=true");
    const res = await POST(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.reply).toBeUndefined();
  });
});
