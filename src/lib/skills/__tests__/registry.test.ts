import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – use vi.hoisted()
// ---------------------------------------------------------------------------
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => mockLogger),
}));

// Mock the memoryManager used by memory-skills
vi.mock("@/lib/rag/memory", () => ({
  memoryManager: {
    store: vi.fn(),
    recall: vi.fn(),
    ingestDocument: vi.fn(),
    ingestFile: vi.fn(),
  },
}));

// Mock agent system used by agent-skills
vi.mock("@/lib/agents/team", () => ({
  TeamOrchestrator: vi.fn(),
}));

vi.mock("@/lib/agents/swarm", () => ({
  SwarmOrchestrator: vi.fn(),
}));

vi.mock("@/lib/agents/presets", () => ({
  presetTeams: [
    { id: "research", name: "Research Team", description: "desc", agents: [], strategy: "sequential" },
  ],
  presetSwarms: [
    { id: "analysis", name: "Analysis Swarm", description: "desc", agents: [], aggregation: "concatenate" },
  ],
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { skillRegistry } from "../registry";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("SkillRegistry", () => {
  describe("constructor", () => {
    it("registers all built-in skills", () => {
      const all = skillRegistry.getAll();
      expect(all.length).toBeGreaterThan(0);
      const ids = all.map((s) => s.id);
      expect(ids).toContain("save_memory");
      expect(ids).toContain("recall_memory");
      expect(ids).toContain("ingest_document");
      expect(ids).toContain("ingest_file");
      expect(ids).toContain("web_search");
      expect(ids).toContain("fetch_url");
      expect(ids).toContain("get_current_time");
      expect(ids).toContain("calculate");
      expect(ids).toContain("summarize_text");
      expect(ids).toContain("spawn_team");
      expect(ids).toContain("spawn_swarm");
    });
  });

  describe("register()", () => {
    it("registers a new skill", () => {
      const skill = {
        id: "test_skill",
        name: "Test Skill",
        description: "A test skill",
        category: "system" as const,
        parameters: [],
        execute: vi.fn(),
      };

      skillRegistry.register(skill);

      expect(skillRegistry.get("test_skill")).toBe(skill);
    });
  });

  describe("registerMany()", () => {
    it("registers multiple skills", () => {
      const skills = [
        {
          id: "batch_1",
          name: "Batch 1",
          description: "desc",
          category: "system" as const,
          parameters: [],
          execute: vi.fn(),
        },
        {
          id: "batch_2",
          name: "Batch 2",
          description: "desc",
          category: "system" as const,
          parameters: [],
          execute: vi.fn(),
        },
      ];

      skillRegistry.registerMany(skills);

      expect(skillRegistry.get("batch_1")).toBe(skills[0]);
      expect(skillRegistry.get("batch_2")).toBe(skills[1]);
    });
  });

  describe("get()", () => {
    it("returns skill by id", () => {
      const skill = skillRegistry.get("save_memory");
      expect(skill).toBeDefined();
      expect(skill!.id).toBe("save_memory");
    });

    it("returns undefined for unknown id", () => {
      expect(skillRegistry.get("nonexistent")).toBeUndefined();
    });
  });

  describe("getAll()", () => {
    it("returns all registered skills as array", () => {
      const all = skillRegistry.getAll();
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThan(0);
    });
  });

  describe("getByCategory()", () => {
    it("returns skills filtered by category", () => {
      const memorySkills = skillRegistry.getByCategory("memory");
      expect(memorySkills.length).toBeGreaterThan(0);
      for (const skill of memorySkills) {
        expect(skill.category).toBe("memory");
      }
    });

    it("returns empty array for non-existent category", () => {
      const skills = skillRegistry.getByCategory("nonexistent");
      expect(skills).toEqual([]);
    });
  });

  describe("toToolDefinitions()", () => {
    it("returns array of OpenAI-style tool definitions", () => {
      const defs = skillRegistry.toToolDefinitions();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThan(0);

      const first = defs[0] as Record<string, unknown>;
      expect(first.type).toBe("function");
      expect(first.function).toBeDefined();

      const fn = first.function as Record<string, unknown>;
      expect(fn.name).toBeDefined();
      expect(fn.description).toBeDefined();
      expect(fn.parameters).toBeDefined();

      const params = fn.parameters as Record<string, unknown>;
      expect(params.type).toBe("object");
      expect(params.properties).toBeDefined();
      expect(Array.isArray(params.required)).toBe(true);
    });

    it("only includes required parameters in required array", () => {
      const defs = skillRegistry.toToolDefinitions();
      const saveMem = defs.find(
        (d) => (d as any).function.name === "save_memory"
      ) as any;
      expect(saveMem).toBeDefined();
      expect(saveMem.function.parameters.required).toContain("content");
    });
  });

  describe("toAITools()", () => {
    it("returns Vercel AI SDK tool format", () => {
      const tools = skillRegistry.toAITools();
      expect(typeof tools).toBe("object");

      expect(tools["save_memory"]).toBeDefined();
      expect(tools["save_memory"].description).toBeDefined();
      expect(tools["save_memory"].parameters).toBeDefined();

      const params = tools["save_memory"].parameters as Record<string, unknown>;
      expect(params.type).toBe("object");
      expect(params.properties).toBeDefined();
      expect(Array.isArray(params.required)).toBe(true);
    });

    it("includes required parameters correctly", () => {
      const tools = skillRegistry.toAITools();
      const calcTool = tools["calculate"];
      expect(calcTool).toBeDefined();

      const params = calcTool.parameters as Record<string, unknown>;
      const required = params.required as string[];
      expect(required).toContain("expression");
    });

    it("includes non-required parameters in properties but not required", () => {
      const tools = skillRegistry.toAITools();
      const timeTool = tools["get_current_time"];
      expect(timeTool).toBeDefined();

      const params = timeTool.parameters as Record<string, unknown>;
      const props = params.properties as Record<string, unknown>;
      const required = params.required as string[];

      expect(props["timezone"]).toBeDefined();
      expect(required).not.toContain("timezone");
    });
  });
});
