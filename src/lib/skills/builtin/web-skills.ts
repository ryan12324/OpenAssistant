import type { SkillDefinition } from "../types";

export const webSearch: SkillDefinition = {
  id: "web_search",
  name: "Web Search",
  description: "Search the web for current information, news, or answers to questions.",
  category: "web",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "The search query",
      required: true,
    },
  ],
  async execute(args) {
    // Uses a search API - configurable per deployment
    const query = args.query as string;

    try {
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
      );
      const data = await response.json();

      const results: string[] = [];
      if (data.AbstractText) {
        results.push(`**Summary:** ${data.AbstractText}`);
      }
      if (data.RelatedTopics) {
        const topics = data.RelatedTopics.slice(0, 5);
        for (const topic of topics) {
          if (topic.Text) {
            results.push(`- ${topic.Text}`);
          }
        }
      }

      return {
        success: true,
        output: results.length > 0
          ? results.join("\n\n")
          : `No immediate results found for "${query}". Try refining your search.`,
        data: { query, resultCount: results.length },
      };
    } catch (error) {
      return {
        success: false,
        output: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

export const fetchUrl: SkillDefinition = {
  id: "fetch_url",
  name: "Fetch URL",
  description: "Fetch and read the content of a web page.",
  category: "web",
  parameters: [
    {
      name: "url",
      type: "string",
      description: "The URL to fetch",
      required: true,
    },
  ],
  async execute(args) {
    const url = args.url as string;

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "OpenAssistant/0.1" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return {
          success: false,
          output: `Failed to fetch URL (HTTP ${response.status})`,
        };
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        return {
          success: true,
          output: `Fetched URL, content type: ${contentType} (binary content not shown)`,
          data: { url, contentType },
        };
      }

      const text = await response.text();
      // Strip HTML tags for a rough text extraction
      const cleaned = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 5000);

      return {
        success: true,
        output: cleaned || "Page content is empty.",
        data: { url, length: cleaned.length },
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to fetch URL: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

export const webSkills = [webSearch, fetchUrl];
