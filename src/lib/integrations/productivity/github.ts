import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface GitHubConfig extends IntegrationConfig { token: string; }

export const githubIntegration: IntegrationDefinition<GitHubConfig> = {
  id: "github", name: "GitHub", description: "Code, issues, PRs, and repository management. Full GitHub API access.",
  category: "productivity", icon: "github", website: "https://github.com/",
  configFields: [
    { key: "token", label: "Personal Access Token", type: "password", description: "GitHub PAT with repo scope", required: true, placeholder: "ghp_..." },
  ],
  skills: [
    { id: "github_list_repos", name: "List Repos", description: "List your GitHub repositories",
      parameters: [{ name: "sort", type: "string", description: "Sort by: updated, stars, name" }] },
    { id: "github_create_issue", name: "Create Issue", description: "Create a GitHub issue",
      parameters: [
        { name: "repo", type: "string", description: "owner/repo", required: true },
        { name: "title", type: "string", description: "Issue title", required: true },
        { name: "body", type: "string", description: "Issue body" },
      ] },
    { id: "github_search_code", name: "Search Code", description: "Search code across GitHub",
      parameters: [{ name: "query", type: "string", description: "Search query", required: true }] },
    { id: "github_get_pr", name: "Get Pull Request", description: "Get PR details",
      parameters: [
        { name: "repo", type: "string", description: "owner/repo", required: true },
        { name: "number", type: "number", description: "PR number", required: true },
      ] },
  ],
};

export class GitHubInstance extends BaseIntegration<GitHubConfig> {
  private get headers() { return { Authorization: `Bearer ${this.config.token}`, Accept: "application/vnd.github+json" }; }
  private readonly API = "https://api.github.com";

  async connect(): Promise<void> {
    const user = await this.apiFetch<{ login: string }>(`${this.API}/user`, { headers: this.headers });
    if (!user.login) throw new Error("Invalid GitHub token");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "github_list_repos": {
        const repos = await this.apiFetch<{ full_name: string; description: string; stargazers_count: number }[]>(
          `${this.API}/user/repos?sort=${args.sort || "updated"}&per_page=20`, { headers: this.headers }
        );
        const list = repos.map((r) => `${r.full_name} - ${r.description || "No description"} (${r.stargazers_count} stars)`).join("\n");
        return { success: true, output: list, data: repos };
      }
      case "github_create_issue": {
        const issue = await this.apiFetch<{ number: number; html_url: string }>(
          `${this.API}/repos/${args.repo}/issues`,
          { method: "POST", headers: this.headers, body: JSON.stringify({ title: args.title, body: args.body }) }
        );
        return { success: true, output: `Issue #${issue.number} created: ${issue.html_url}`, data: issue };
      }
      case "github_search_code": {
        const result = await this.apiFetch<{ items: { path: string; repository: { full_name: string } }[] }>(
          `${this.API}/search/code?q=${encodeURIComponent(args.query as string)}`, { headers: this.headers }
        );
        const list = result.items.slice(0, 10).map((i) => `${i.repository.full_name}/${i.path}`).join("\n");
        return { success: true, output: `Results:\n${list}`, data: result.items };
      }
      case "github_get_pr": {
        const pr = await this.apiFetch<{ title: string; state: string; html_url: string; body: string }>(
          `${this.API}/repos/${args.repo}/pulls/${args.number}`, { headers: this.headers }
        );
        return { success: true, output: `PR: ${pr.title}\nState: ${pr.state}\nURL: ${pr.html_url}\n\n${pr.body || ""}`, data: pr };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
