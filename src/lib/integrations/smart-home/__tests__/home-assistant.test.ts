const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { HomeAssistantInstance, homeAssistantIntegration } from "@/lib/integrations/smart-home/home-assistant";

describe("HomeAssistantInstance", () => {
  let instance: HomeAssistantInstance;
  const config = { url: "http://ha.local:8123", token: "ha-token" };

  beforeEach(() => {
    instance = new HomeAssistantInstance(homeAssistantIntegration, config);
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(homeAssistantIntegration.id).toBe("home-assistant");
      expect(homeAssistantIntegration.category).toBe("smart-home");
      expect(homeAssistantIntegration.skills.length).toBe(4);
    });
  });

  describe("connect", () => {
    it("should connect with valid credentials", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "API running." }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if message is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      await expect(instance.connect()).rejects.toThrow("Cannot connect to Home Assistant");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: "API running." }),
      });
      await instance.connect();
    });

    it("should list entities without domain filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { entity_id: "light.living_room", state: "on" },
            { entity_id: "sensor.temp", state: "22" },
          ]),
      });
      const result = await instance.executeSkill("ha_list_entities", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("light.living_room");
      expect(result.output).toContain("sensor.temp");
    });

    it("should list entities with domain filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { entity_id: "light.living_room", state: "on" },
            { entity_id: "sensor.temp", state: "22" },
          ]),
      });
      const result = await instance.executeSkill("ha_list_entities", { domain: "light" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("light.living_room");
      expect(result.output).not.toContain("sensor.temp");
    });

    it("should get entity state", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            entity_id: "light.living_room",
            state: "on",
            attributes: { brightness: 200 },
          }),
      });
      const result = await instance.executeSkill("ha_get_state", { entity_id: "light.living_room" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("on");
      expect(result.output).toContain("brightness");
    });

    it("should call a service without data", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
      const result = await instance.executeSkill("ha_call_service", {
        domain: "light",
        service: "turn_on",
        entity_id: "light.living_room",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("light.turn_on");
    });

    it("should call a service with data", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
      const result = await instance.executeSkill("ha_call_service", {
        domain: "light",
        service: "turn_on",
        entity_id: "light.living_room",
        data: '{"brightness":100}',
      });
      expect(result.success).toBe(true);
    });

    it("should trigger automation", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
      const result = await instance.executeSkill("ha_trigger_automation", {
        entity_id: "automation.morning",
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Automation triggered");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("ha_unknown", {});
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ message: "API running." }) });
      await instance.connect();
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });
});
