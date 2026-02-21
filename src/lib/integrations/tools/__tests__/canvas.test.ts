import { CanvasInstance, canvasIntegration } from "@/lib/integrations/tools/canvas";

describe("CanvasInstance", () => {
  let instance: CanvasInstance;

  beforeEach(() => {
    instance = new CanvasInstance(canvasIntegration, { enabled: true });
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(canvasIntegration.id).toBe("canvas");
      expect(canvasIntegration.category).toBe("tools");
      expect(canvasIntegration.skills.length).toBe(2);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect and disconnect", async () => {
      await instance.connect();
      expect(instance.status).toBe("connected");
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      await instance.connect();
    });

    it("should render canvas with title", async () => {
      const result = await instance.executeSkill("canvas_render", {
        html: "<div>Hello</div>",
        title: "My Canvas",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("My Canvas");
    });

    it("should render canvas without title", async () => {
      const result = await instance.executeSkill("canvas_render", {
        html: "<div>Hello</div>",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Untitled");
    });

    it("should create a chart with title", async () => {
      const result = await instance.executeSkill("canvas_chart", {
        type: "bar",
        data: '{"labels":["a","b"]}',
        title: "Sales",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("bar");
      expect(result.output).toContain("Sales");
    });

    it("should create a chart without title", async () => {
      const result = await instance.executeSkill("canvas_chart", {
        type: "pie",
        data: "{}",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Untitled");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("canvas_unknown", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
