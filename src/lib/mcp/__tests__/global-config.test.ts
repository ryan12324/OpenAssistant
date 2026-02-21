import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockReadFile = vi.fn();

vi.mock("fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// ---------------------------------------------------------------------------
// Import after mocks — must use resetModules for cache testing
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("global-config", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("loadGlobalMcpServers()", () => {
    it("parses a valid config file with stdio and http servers", async () => {
      const configContent = JSON.stringify({
        mcpServers: {
          github: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_TOKEN: "ghp_test" },
            enabled: true,
          },
          search: {
            transport: "http",
            url: "https://search.example.com/mcp",
            headers: { Authorization: "Bearer token" },
          },
        },
      });

      mockReadFile.mockResolvedValueOnce(configContent);

      const { loadGlobalMcpServers } = await import("../global-config");
      const configs = await loadGlobalMcpServers();

      expect(configs).toHaveLength(2);

      const github = configs.find((c) => c.name === "github")!;
      expect(github.id).toBe("global:github");
      expect(github.transport).toBe("stdio");
      expect(github.command).toBe("npx");
      expect(github.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
      expect(github.env).toEqual({ GITHUB_TOKEN: "ghp_test" });
      expect(github.enabled).toBe(true);
      expect(github.scope).toBe("global");

      const search = configs.find((c) => c.name === "search")!;
      expect(search.id).toBe("global:search");
      expect(search.transport).toBe("http");
      expect(search.url).toBe("https://search.example.com/mcp");
      expect(search.headers).toEqual({ Authorization: "Bearer token" });
      expect(search.enabled).toBe(true); // enabled !== false
    });

    it("infers stdio transport when command is present and transport is not specified", async () => {
      const configContent = JSON.stringify({
        mcpServers: {
          inferredStdio: {
            command: "node",
            args: ["server.js"],
          },
        },
      });

      mockReadFile.mockResolvedValueOnce(configContent);

      const { loadGlobalMcpServers } = await import("../global-config");
      const configs = await loadGlobalMcpServers();

      expect(configs[0].transport).toBe("stdio");
    });

    it("infers http transport when no command present and transport is not specified", async () => {
      const configContent = JSON.stringify({
        mcpServers: {
          inferredHttp: {
            url: "https://example.com/mcp",
          },
        },
      });

      mockReadFile.mockResolvedValueOnce(configContent);

      const { loadGlobalMcpServers } = await import("../global-config");
      const configs = await loadGlobalMcpServers();

      expect(configs[0].transport).toBe("http");
    });

    it("sets enabled to false when explicitly disabled", async () => {
      const configContent = JSON.stringify({
        mcpServers: {
          disabled: {
            transport: "stdio",
            command: "node",
            enabled: false,
          },
        },
      });

      mockReadFile.mockResolvedValueOnce(configContent);

      const { loadGlobalMcpServers } = await import("../global-config");
      const configs = await loadGlobalMcpServers();

      expect(configs[0].enabled).toBe(false);
    });

    it("returns empty array when no config files exist", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const { loadGlobalMcpServers } = await import("../global-config");
      const configs = await loadGlobalMcpServers();

      expect(configs).toEqual([]);
      // Should try both config paths
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });

    it("skips file with invalid JSON and tries next path", async () => {
      mockReadFile
        .mockResolvedValueOnce("not valid json")
        .mockRejectedValueOnce(new Error("ENOENT"));

      const { loadGlobalMcpServers } = await import("../global-config");
      const configs = await loadGlobalMcpServers();

      expect(configs).toEqual([]);
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });

    it("skips file with null mcpServers and tries next path", async () => {
      mockReadFile
        .mockResolvedValueOnce(JSON.stringify({ mcpServers: null }))
        .mockRejectedValueOnce(new Error("ENOENT"));

      const { loadGlobalMcpServers } = await import("../global-config");
      const configs = await loadGlobalMcpServers();

      expect(configs).toEqual([]);
    });

    it("skips file with no mcpServers key and tries next path", async () => {
      mockReadFile
        .mockResolvedValueOnce(JSON.stringify({ other: "data" }))
        .mockRejectedValueOnce(new Error("ENOENT"));

      const { loadGlobalMcpServers } = await import("../global-config");
      const configs = await loadGlobalMcpServers();

      expect(configs).toEqual([]);
    });

    it("uses second config path when first fails", async () => {
      const configContent = JSON.stringify({
        mcpServers: {
          backup: {
            transport: "stdio",
            command: "node",
          },
        },
      });

      mockReadFile
        .mockRejectedValueOnce(new Error("ENOENT"))
        .mockResolvedValueOnce(configContent);

      const { loadGlobalMcpServers } = await import("../global-config");
      const configs = await loadGlobalMcpServers();

      expect(configs).toHaveLength(1);
      expect(configs[0].name).toBe("backup");
    });

    it("returns cached results within TTL", async () => {
      const configContent = JSON.stringify({
        mcpServers: {
          cached: { transport: "stdio", command: "node" },
        },
      });

      mockReadFile.mockResolvedValue(configContent);

      const { loadGlobalMcpServers } = await import("../global-config");

      // First call reads file
      const first = await loadGlobalMcpServers();
      expect(first).toHaveLength(1);
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const second = await loadGlobalMcpServers();
      expect(second).toEqual(first);
      expect(mockReadFile).toHaveBeenCalledTimes(1); // not called again
    });
  });

  describe("invalidateGlobalConfigCache()", () => {
    it("clears the cache so next load reads from file", async () => {
      const configContent1 = JSON.stringify({
        mcpServers: {
          server1: { transport: "stdio", command: "node" },
        },
      });
      const configContent2 = JSON.stringify({
        mcpServers: {
          server2: { transport: "http", url: "https://example.com" },
        },
      });

      mockReadFile
        .mockResolvedValueOnce(configContent1)
        .mockResolvedValueOnce(configContent2);

      const { loadGlobalMcpServers, invalidateGlobalConfigCache } =
        await import("../global-config");

      // First load
      const first = await loadGlobalMcpServers();
      expect(first[0].name).toBe("server1");

      // Invalidate cache
      invalidateGlobalConfigCache();

      // Second load should re-read file
      const second = await loadGlobalMcpServers();
      expect(second[0].name).toBe("server2");
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });
  });
});
