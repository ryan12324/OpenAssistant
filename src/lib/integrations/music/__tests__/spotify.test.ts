const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

import { SpotifyInstance, spotifyIntegration } from "@/lib/integrations/music/spotify";

describe("SpotifyInstance", () => {
  let instance: SpotifyInstance;
  const config = { clientId: "cid", clientSecret: "cs", refreshToken: "rt" };

  beforeEach(() => {
    instance = new SpotifyInstance(spotifyIntegration, config);
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(spotifyIntegration.id).toBe("spotify");
      expect(spotifyIntegration.category).toBe("music");
      expect(spotifyIntegration.skills.length).toBe(5);
    });
  });

  describe("connect / disconnect", () => {
    it("should get access token on connect", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "at-123" }),
      });
      await instance.connect();
      expect(instance.status).toBe("connected");
    });

    it("should clear token on disconnect", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "at-123" }),
      });
      await instance.connect();
      await instance.disconnect();
      expect(instance.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "at-123" }),
      });
      await instance.connect();
    });

    it("should play a track", async () => {
      // Search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tracks: {
              items: [{ uri: "spotify:track:123", name: "Song", artists: [{ name: "Artist" }] }],
            },
          }),
      });
      // Play
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await instance.executeSkill("spotify_play", { query: "Song" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Playing: Song by Artist");
    });

    it("should return no results when search finds nothing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tracks: { items: [] } }),
      });
      const result = await instance.executeSkill("spotify_play", { query: "Nonexistent" });
      expect(result.success).toBe(false);
      expect(result.output).toContain("No results");
    });

    it("should pause playback", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await instance.executeSkill("spotify_pause", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("paused");
    });

    it("should skip track", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await instance.executeSkill("spotify_skip", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Skipped");
    });

    it("should get current track", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            item: { name: "CurrentSong", artists: [{ name: "Band" }] },
          }),
      });
      const result = await instance.executeSkill("spotify_current", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("CurrentSong by Band");
    });

    it("should handle nothing playing (204)", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
      const result = await instance.executeSkill("spotify_current", {});
      expect(result.success).toBe(true);
      expect(result.output).toContain("Nothing is currently playing");
    });

    it("should search with default type", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tracks: { items: [{ name: "Track1", id: "t1" }] },
          }),
      });
      const result = await instance.executeSkill("spotify_search", { query: "test" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Track1");
    });

    it("should search with custom type", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            artists: { items: [{ name: "Artist1", id: "a1" }] },
          }),
      });
      const result = await instance.executeSkill("spotify_search", { query: "test", type: "artist" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Artist1");
    });

    it("should handle search with no results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tracks: {} }),
      });
      const result = await instance.executeSkill("spotify_search", { query: "nothing" });
      expect(result.success).toBe(true);
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("spotify_unknown", {});
      expect(result.success).toBe(false);
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const result = await (instance as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
