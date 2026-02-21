const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { ShazamInstance, shazamIntegration } from "@/lib/integrations/music/shazam";

describe("ShazamInstance", () => {
  let instance: ShazamInstance;

  beforeEach(() => {
    instance = new ShazamInstance(shazamIntegration, { rapidApiKey: "rk" });
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(shazamIntegration.id).toBe("shazam");
      expect(shazamIntegration.category).toBe("music");
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

    it("should search songs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tracks: {
              hits: [
                { track: { title: "Song1", subtitle: "Artist1" } },
                { track: { title: "Song2", subtitle: "Artist2" } },
              ],
            },
          }),
      });
      const result = await instance.executeSkill("shazam_search", { query: "test" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Song1");
      expect(result.output).toContain("Artist1");
    });

    it("should handle no results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tracks: { hits: [] } }),
      });
      const result = await instance.executeSkill("shazam_search", { query: "nothing" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("No results");
    });

    it("should handle missing tracks", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      const result = await instance.executeSkill("shazam_search", { query: "nothing" });
      expect(result.success).toBe(true);
      expect(result.output).toBe("No results");
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("shazam_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
