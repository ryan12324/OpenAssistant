const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { GitHubInstance, githubIntegration } from "@/lib/integrations/productivity/github";

describe("GitHubInstance", () => {
  let instance: GitHubInstance;

  beforeEach(() => {
    instance = new GitHubInstance(githubIntegration, { token: "ghp_test" });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(githubIntegration.id).toBe("github");
      expect(githubIntegration.category).toBe("productivity");
      expect(githubIntegration.skills.length).toBe(4);
    });
  });

  describe("connect", () => {
    it("should connect with valid token", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ login: "user" }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if login is missing", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await expect(instance.connect()).rejects.toThrow("Invalid GitHub token");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ login: "user" }) });
      await instance.connect();
    });

    it("should list repos", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ full_name: "user/repo", description: "A repo", stargazers_count: 10 }]),
      });
      const result = await instance.executeSkill("github_list_repos", { sort: "stars" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("user/repo");
    });

    it("should list repos with default sort", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ full_name: "u/r", description: null, stargazers_count: 0 }]),
      });
      const result = await instance.executeSkill("github_list_repos", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("No description");
    });

    it("should create an issue", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ number: 42, html_url: "https://github.com/user/repo/issues/42" }),
      });
      const result = await instance.executeSkill("github_create_issue", {
        repo: "user/repo",
        title: "Bug",
        body: "Fix this",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("#42");
    });

    it("should search code", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [{ path: "src/index.ts", repository: { full_name: "u/r" } }] }),
      });
      const result = await instance.executeSkill("github_search_code", { query: "function" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("u/r/src/index.ts");
    });

    it("should get a PR", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ title: "Fix bug", state: "open", html_url: "https://github.com/u/r/pull/1", body: "Fixes #42" }),
      });
      const result = await instance.executeSkill("github_get_pr", { repo: "u/r", number: 1 });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Fix bug");
    });

    it("should get a PR with null body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ title: "PR", state: "closed", html_url: "url", body: null }),
      });
      const result = await instance.executeSkill("github_get_pr", { repo: "u/r", number: 1 });
      expect(result.success).toBe(true);
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("github_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });

  describe("disconnect", () => {
    it("should set status to disconnected", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ login: "user" }) });
      await instance.connect();
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });
});
