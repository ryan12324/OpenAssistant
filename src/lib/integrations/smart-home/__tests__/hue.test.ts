const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { HueInstance, hueIntegration } from "@/lib/integrations/smart-home/hue";

describe("HueInstance", () => {
  let instance: HueInstance;
  const config = { bridgeIp: "192.168.1.100", apiKey: "hue-key" };

  beforeEach(() => {
    instance = new HueInstance(hueIntegration, config);
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(hueIntegration.id).toBe("philips-hue");
      expect(hueIntegration.category).toBe("smart-home");
      expect(hueIntegration.skills.length).toBe(3);
    });
  });

  describe("connect", () => {
    it("should connect with valid credentials", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ "1": { name: "Light 1" } }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should throw if response is not an object", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve("invalid"),
      });
      await expect(instance.connect()).rejects.toThrow("Invalid Hue Bridge credentials");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ "1": { name: "L1" } }),
      });
      await instance.connect();
    });

    it("should list lights", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            "1": { name: "Living Room", state: { on: true, bri: 200 } },
            "2": { name: "Bedroom", state: { on: false, bri: 0 } },
          }),
      });
      const result = await instance.executeSkill("hue_list_lights", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Living Room");
      expect(result.output).toContain("ON");
      expect(result.output).toContain("OFF");
    });

    it("should set light on/off and brightness", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ success: true }]) });
      const result = await instance.executeSkill("hue_set_light", {
        light_id: "1",
        on: true,
        brightness: 150,
      });
      expect(result.success).toBe(true);
      expect(result.output).toContain("updated");
    });

    it("should set light with only on parameter", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
      const result = await instance.executeSkill("hue_set_light", {
        light_id: "1",
        on: false,
      });
      expect(result.success).toBe(true);
    });

    it("should set a scene", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
      const result = await instance.executeSkill("hue_set_scene", { scene_id: "s1", group_id: "0" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Scene activated");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("hue_unknown", {});
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
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ "1": { name: "L1" } }) });
      await instance.connect();
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });
});
