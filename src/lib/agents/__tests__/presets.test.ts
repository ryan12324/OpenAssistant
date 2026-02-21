import { describe, it, expect } from "vitest";

import {
  researchTeam,
  codeReviewTeam,
  planningTeam,
  debateTeam,
  creativeTeam,
  analysisSwarm,
  factCheckSwarm,
  translationSwarm,
  generalRouter,
  presetTeams,
  presetSwarms,
  presetRouters,
} from "@/lib/agents/presets";

// ─── Tests ───────────────────────────────────────────────────
describe("presets", () => {
  // ─── presetTeams ────────────────────────────────────────────
  describe("presetTeams", () => {
    it("exports an array of all team definitions", () => {
      expect(presetTeams).toBeInstanceOf(Array);
      expect(presetTeams).toHaveLength(5);
    });

    it("contains all named teams", () => {
      const ids = presetTeams.map((t) => t.id);
      expect(ids).toContain("research-team");
      expect(ids).toContain("code-review-team");
      expect(ids).toContain("planning-team");
      expect(ids).toContain("debate-team");
      expect(ids).toContain("creative-team");
    });
  });

  // ─── presetSwarms ───────────────────────────────────────────
  describe("presetSwarms", () => {
    it("exports an array of all swarm definitions", () => {
      expect(presetSwarms).toBeInstanceOf(Array);
      expect(presetSwarms).toHaveLength(3);
    });

    it("contains all named swarms", () => {
      const ids = presetSwarms.map((s) => s.id);
      expect(ids).toContain("analysis-swarm");
      expect(ids).toContain("fact-check-swarm");
      expect(ids).toContain("translation-swarm");
    });
  });

  // ─── presetRouters ──────────────────────────────────────────
  describe("presetRouters", () => {
    it("exports an array of all router definitions", () => {
      expect(presetRouters).toBeInstanceOf(Array);
      expect(presetRouters).toHaveLength(1);
    });

    it("contains the general router", () => {
      const ids = presetRouters.map((r) => r.id);
      expect(ids).toContain("general-router");
    });
  });

  // ─── Individual team definitions ────────────────────────────
  describe("researchTeam", () => {
    it("has correct id and strategy", () => {
      expect(researchTeam.id).toBe("research-team");
      expect(researchTeam.strategy).toBe("chain");
    });

    it("has 3 agents: researcher, analyst, writer", () => {
      expect(researchTeam.agents).toHaveLength(3);
      const ids = researchTeam.agents.map((a) => a.id);
      expect(ids).toEqual(["researcher", "analyst", "writer"]);
    });

    it("has name and description", () => {
      expect(researchTeam.name).toBe("Research Team");
      expect(researchTeam.description).toBeTruthy();
    });

    it("researcher has skillIds defined", () => {
      const researcher = researchTeam.agents.find((a) => a.id === "researcher");
      expect(researcher!.skillIds).toEqual(
        expect.arrayContaining(["web_search", "fetch_url", "recall_memory"])
      );
    });
  });

  describe("codeReviewTeam", () => {
    it("has correct id and strategy", () => {
      expect(codeReviewTeam.id).toBe("code-review-team");
      expect(codeReviewTeam.strategy).toBe("sequential");
    });

    it("has 3 agents: architect, security-reviewer, final-reviewer", () => {
      expect(codeReviewTeam.agents).toHaveLength(3);
      const ids = codeReviewTeam.agents.map((a) => a.id);
      expect(ids).toEqual(["architect", "security-reviewer", "final-reviewer"]);
    });
  });

  describe("planningTeam", () => {
    it("has correct id and strategy", () => {
      expect(planningTeam.id).toBe("planning-team");
      expect(planningTeam.strategy).toBe("supervisor");
    });

    it("has supervisorId set", () => {
      expect(planningTeam.supervisorId).toBe("project-lead");
    });

    it("has 3 agents: project-lead, tech-planner, implementer", () => {
      expect(planningTeam.agents).toHaveLength(3);
      const ids = planningTeam.agents.map((a) => a.id);
      expect(ids).toEqual(["project-lead", "tech-planner", "implementer"]);
    });

    it("tech-planner has skillIds", () => {
      const planner = planningTeam.agents.find(
        (a) => a.id === "tech-planner"
      );
      expect(planner!.skillIds).toContain("web_search");
    });
  });

  describe("debateTeam", () => {
    it("has correct id and strategy", () => {
      expect(debateTeam.id).toBe("debate-team");
      expect(debateTeam.strategy).toBe("debate");
    });

    it("has maxRounds and synthesizerId", () => {
      expect(debateTeam.maxRounds).toBe(2);
      expect(debateTeam.synthesizerId).toBe("moderator");
    });

    it("has 3 agents: advocate, critic, moderator", () => {
      expect(debateTeam.agents).toHaveLength(3);
      const ids = debateTeam.agents.map((a) => a.id);
      expect(ids).toEqual(["advocate", "critic", "moderator"]);
    });
  });

  describe("creativeTeam", () => {
    it("has correct id and strategy", () => {
      expect(creativeTeam.id).toBe("creative-team");
      expect(creativeTeam.strategy).toBe("chain");
    });

    it("has 3 agents: brainstormer, critic-refiner, producer", () => {
      expect(creativeTeam.agents).toHaveLength(3);
      const ids = creativeTeam.agents.map((a) => a.id);
      expect(ids).toEqual(["brainstormer", "critic-refiner", "producer"]);
    });
  });

  // ─── Individual swarm definitions ───────────────────────────
  describe("analysisSwarm", () => {
    it("has correct id and aggregation", () => {
      expect(analysisSwarm.id).toBe("analysis-swarm");
      expect(analysisSwarm.aggregation).toBe("synthesize");
    });

    it("has 3 agents", () => {
      expect(analysisSwarm.agents).toHaveLength(3);
      const ids = analysisSwarm.agents.map((a) => a.id);
      expect(ids).toEqual([
        "technical-analyst",
        "business-analyst",
        "ux-analyst",
      ]);
    });
  });

  describe("factCheckSwarm", () => {
    it("has correct id and aggregation", () => {
      expect(factCheckSwarm.id).toBe("fact-check-swarm");
      expect(factCheckSwarm.aggregation).toBe("vote");
    });

    it("has 3 checkers with skillIds", () => {
      expect(factCheckSwarm.agents).toHaveLength(3);
      for (const agent of factCheckSwarm.agents) {
        expect(agent.skillIds).toContain("web_search");
      }
    });
  });

  describe("translationSwarm", () => {
    it("has correct id and aggregation", () => {
      expect(translationSwarm.id).toBe("translation-swarm");
      expect(translationSwarm.aggregation).toBe("best");
    });

    it("has 3 translators", () => {
      expect(translationSwarm.agents).toHaveLength(3);
      const ids = translationSwarm.agents.map((a) => a.id);
      expect(ids).toEqual([
        "translator-formal",
        "translator-natural",
        "translator-literal",
      ]);
    });
  });

  // ─── Individual router definitions ──────────────────────────
  describe("generalRouter", () => {
    it("has correct id and settings", () => {
      expect(generalRouter.id).toBe("general-router");
      expect(generalRouter.useAIRouting).toBe(true);
      expect(generalRouter.defaultAgentId).toBe("generalist");
    });

    it("has 4 agents", () => {
      expect(generalRouter.agents).toHaveLength(4);
      const ids = generalRouter.agents.map((a) => a.id);
      expect(ids).toEqual([
        "generalist",
        "coder",
        "creative-writer",
        "data-expert",
      ]);
    });

    it("data-expert has skillIds", () => {
      const dataExpert = generalRouter.agents.find(
        (a) => a.id === "data-expert"
      );
      expect(dataExpert!.skillIds).toContain("calculate");
    });
  });

  // ─── Shape validation ───────────────────────────────────────
  describe("shape validation", () => {
    it("all teams have required fields", () => {
      for (const team of presetTeams) {
        expect(team.id).toBeTruthy();
        expect(team.name).toBeTruthy();
        expect(team.description).toBeTruthy();
        expect(team.strategy).toBeTruthy();
        expect(team.agents.length).toBeGreaterThan(0);

        for (const agent of team.agents) {
          expect(agent.id).toBeTruthy();
          expect(agent.name).toBeTruthy();
          expect(agent.role).toBeTruthy();
          expect(agent.systemPrompt).toBeTruthy();
        }
      }
    });

    it("all swarms have required fields", () => {
      for (const swarm of presetSwarms) {
        expect(swarm.id).toBeTruthy();
        expect(swarm.name).toBeTruthy();
        expect(swarm.description).toBeTruthy();
        expect(swarm.aggregation).toBeTruthy();
        expect(swarm.agents.length).toBeGreaterThan(0);

        for (const agent of swarm.agents) {
          expect(agent.id).toBeTruthy();
          expect(agent.name).toBeTruthy();
          expect(agent.role).toBeTruthy();
          expect(agent.systemPrompt).toBeTruthy();
        }
      }
    });

    it("all routers have required fields", () => {
      for (const router of presetRouters) {
        expect(router.id).toBeTruthy();
        expect(router.name).toBeTruthy();
        expect(router.description).toBeTruthy();
        expect(router.defaultAgentId).toBeTruthy();
        expect(router.agents.length).toBeGreaterThan(0);

        for (const agent of router.agents) {
          expect(agent.id).toBeTruthy();
          expect(agent.name).toBeTruthy();
          expect(agent.role).toBeTruthy();
          expect(agent.systemPrompt).toBeTruthy();
        }
      }
    });
  });
});
