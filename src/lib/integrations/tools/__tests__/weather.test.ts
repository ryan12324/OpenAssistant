const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

import { WeatherInstance, weatherIntegration } from "@/lib/integrations/tools/weather";

describe("WeatherInstance", () => {
  let instance: WeatherInstance;

  beforeEach(() => {
    instance = new WeatherInstance(weatherIntegration, {});
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(weatherIntegration.id).toBe("weather");
      expect(weatherIntegration.category).toBe("tools");
      expect(weatherIntegration.skills.length).toBe(2);
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

    it("should get current weather with city name", async () => {
      // Geocode
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ latitude: 40.7, longitude: -74.0, name: "New York" }],
          }),
      });
      // Weather
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            current: {
              temperature_2m: 22,
              relative_humidity_2m: 55,
              wind_speed_10m: 12,
              weather_code: 0,
            },
          }),
      });

      const result = await instance.executeSkill("weather_current", { location: "New York" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("New York");
      expect(result.output).toContain("22");
    });

    it("should get current weather with coordinates", async () => {
      // No geocode needed for coordinates
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            current: {
              temperature_2m: 18,
              relative_humidity_2m: 60,
              wind_speed_10m: 8,
              weather_code: 1,
            },
          }),
      });

      const result = await instance.executeSkill("weather_current", { location: "40.7,-74.0" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("18");
    });

    it("should throw if location not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const result = await instance.executeSkill("weather_current", { location: "NonexistentPlace" });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Location not found");
    });

    it("should throw if geocode results are missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await instance.executeSkill("weather_current", { location: "Nowhere" });
      expect(result.success).toBe(false);
    });

    it("should get weather forecast with default days", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ latitude: 51.5, longitude: -0.1, name: "London" }],
          }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            daily: {
              time: ["2024-01-01", "2024-01-02", "2024-01-03"],
              temperature_2m_max: [10, 12, 11],
              temperature_2m_min: [3, 5, 4],
              weather_code: [1, 2, 3],
            },
          }),
      });

      const result = await instance.executeSkill("weather_forecast", { location: "London" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("London");
      expect(result.output).toContain("2024-01-01");
    });

    it("should get weather forecast with custom days", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ latitude: 48.8, longitude: 2.3, name: "Paris" }],
          }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            daily: { time: ["2024-01-01"], temperature_2m_max: [8], temperature_2m_min: [2], weather_code: [1] },
          }),
      });

      const result = await instance.executeSkill("weather_forecast", { location: "Paris", days: 1 });
      expect(result.success).toBe(true);
    });

    it("should return error for unknown skill", async () => {
      const result = await instance.executeSkill("weather_unknown", { location: "X" });
      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ latitude: 0, longitude: 0, name: "Null Island" }] }),
      });
      const result = await (instance as any).handleSkill("nonexistent_skill", { location: "Null Island" });
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });
  });
});
