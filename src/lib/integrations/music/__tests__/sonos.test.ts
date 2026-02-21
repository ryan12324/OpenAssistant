const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { SonosInstance, sonosIntegration } from "@/lib/integrations/music/sonos";

describe("SonosInstance", () => {
  let instance: SonosInstance;

  beforeEach(() => {
    instance = new SonosInstance(sonosIntegration, { apiKey: "sonos-key" });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(sonosIntegration.id).toBe("sonos");
      expect(sonosIntegration.category).toBe("music");
      expect(sonosIntegration.skills.length).toBe(4);
    });
  });

  describe("connect / disconnect", () => {
    it("should connect", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ households: [] }) });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should disconnect", async () => {
      instance.status = "connected";
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ households: [] }) });
      await instance.connect();
    });

    it("should play on a group", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      const result = await instance.executeSkill("sonos_play", { group_id: "g1" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Playback started");
    });

    it("should pause on a group", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      const result = await instance.executeSkill("sonos_pause", { group_id: "g1" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("paused");
    });

    it("should set volume", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      const result = await instance.executeSkill("sonos_volume", { group_id: "g1", volume: 50 });
      expect(result.success).toBe(true);
      expect(result.output).toContain("50");
    });

    it("should list groups", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ households: [{ id: "h1" }, { id: "h2" }] }),
      });
      const result = await instance.executeSkill("sonos_list_groups", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("2 households");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("sonos_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
