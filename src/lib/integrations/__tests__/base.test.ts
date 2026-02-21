const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("global", () => ({}));

// Replace global fetch
beforeAll(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

import { BaseIntegration } from "@/lib/integrations/base";
import type { IntegrationDefinition, IntegrationConfig } from "@/lib/integrations/types";

// Concrete subclass for testing the abstract base
class TestIntegration extends BaseIntegration<IntegrationConfig> {
  connectCalled = false;
  disconnectCalled = false;
  lastSkillId?: string;
  lastSkillArgs?: Record<string, unknown>;
  skillResult: { success: boolean; output: string; data?: unknown } = {
    success: true,
    output: "ok",
  };
  shouldThrow = false;

  async connect(): Promise<void> {
    this.connectCalled = true;
    this.status = "connected";
  }

  async disconnect(): Promise<void> {
    this.disconnectCalled = true;
    this.status = "disconnected";
  }

  protected async handleSkill(
    skillId: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output: string; data?: unknown }> {
    this.lastSkillId = skillId;
    this.lastSkillArgs = args;
    if (this.shouldThrow) throw new Error("skill boom");
    return this.skillResult;
  }

  // Expose protected apiFetch for testing
  public testApiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    return this.apiFetch<T>(url, options);
  }
}

const testDefinition: IntegrationDefinition<IntegrationConfig> = {
  id: "test-integration",
  name: "Test",
  description: "A test integration",
  category: "tools",
  icon: "test",
  configFields: [],
  skills: [
    {
      id: "test_skill",
      name: "Test Skill",
      description: "A test skill",
      parameters: [{ name: "arg1", type: "string", description: "Arg 1", required: true }],
    },
  ],
};

describe("BaseIntegration", () => {
  let instance: TestIntegration;

  beforeEach(() => {
    instance = new TestIntegration(testDefinition, { key: "value" });
    mockFetch.mockReset();
  });

  describe("constructor", () => {
    it("should set definition and config", () => {
      expect(instance.definition).toBe(testDefinition);
      expect(instance.config).toEqual({ key: "value" });
    });

    it("should initialize status to disconnected", () => {
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill", () => {
    it("should return not found for unknown skill", async () => {
      const result = await instance.executeSkill("nonexistent", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
      expect(result.output).toContain("nonexistent");
      expect(result.output).toContain("Test");
    });

    it("should return error when not connected", async () => {
      const result = await instance.executeSkill("test_skill", { arg1: "val" });
      expect(result.success).toBe(false);
      expect(result.output).toContain("not connected");
      expect(result.output).toContain("Test");
    });

    it("should delegate to handleSkill when connected", async () => {
      await instance.connect();
      const result = await instance.executeSkill("test_skill", { arg1: "val" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("ok");
      expect(instance.lastSkillId).toBe("test_skill");
      expect(instance.lastSkillArgs).toEqual({ arg1: "val" });
    });

    it("should catch errors from handleSkill and return error result", async () => {
      await instance.connect();
      instance.shouldThrow = true;
      const result = await instance.executeSkill("test_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("skill boom");
      expect(result.output).toContain("Test");
    });

    it("should handle non-Error throws from handleSkill", async () => {
      await instance.connect();
      // Override handleSkill to throw a non-Error
      instance["handleSkill"] = async () => {
        throw "string error";
      };
      const result = await instance.executeSkill("test_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown error");
    });
  });

  describe("apiFetch", () => {
    it("should make a fetch call with default headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "test" }),
      });

      const result = await instance.testApiFetch<{ data: string }>("https://api.example.com/test");
      expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/test", {
        headers: { "Content-Type": "application/json" },
      });
      expect(result).toEqual({ data: "test" });
    });

    it("should merge custom headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await instance.testApiFetch("https://api.example.com/test", {
        headers: { Authorization: "Bearer token" },
      });

      expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/test", {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
      });
    });

    it("should pass through additional options", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await instance.testApiFetch("https://api.example.com/test", {
        method: "POST",
        body: '{"key":"val"}',
      });

      expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/test", {
        method: "POST",
        body: '{"key":"val"}',
        headers: { "Content-Type": "application/json" },
      });
    });

    it("should throw on non-ok responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      await expect(instance.testApiFetch("https://api.example.com/test")).rejects.toThrow(
        "API error (401): Unauthorized"
      );
    });

    it("should throw on 500 error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(instance.testApiFetch("https://api.example.com/test")).rejects.toThrow(
        "API error (500): Internal Server Error"
      );
    });
  });

  describe("connect / disconnect", () => {
    it("should update status on connect", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
      expect(instance.connectCalled).toBe(true);
    });

    it("should update status on disconnect", async () => {
      await instance.connect();
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
      expect(instance.disconnectCalled).toBe(true);
    });
  });
});
