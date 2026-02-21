import { describe, it, expect, vi } from "vitest";

const { mockAuth, mockHandlers } = vi.hoisted(() => ({
  mockAuth: { id: "auth-instance" },
  mockHandlers: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => mockHandlers,
}));

import { GET, POST } from "../route";

describe("auth/[...all] route", () => {
  it("exports GET handler from toNextJsHandler", () => {
    expect(GET).toBe(mockHandlers.GET);
  });

  it("exports POST handler from toNextJsHandler", () => {
    expect(POST).toBe(mockHandlers.POST);
  });
});
