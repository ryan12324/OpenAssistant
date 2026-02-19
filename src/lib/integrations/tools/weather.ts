import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface WeatherConfig extends IntegrationConfig { apiKey?: string; }

export const weatherIntegration: IntegrationDefinition<WeatherConfig> = {
  id: "weather", name: "Weather", description: "Forecasts and current conditions via Open-Meteo (free, no API key required).",
  category: "tools", icon: "weather", website: "https://open-meteo.com/",
  configFields: [
    { key: "apiKey", label: "API Key (Optional)", type: "password", description: "Optional: OpenWeatherMap API key for enhanced data", required: false },
  ],
  skills: [
    { id: "weather_current", name: "Current Weather", description: "Get current weather for a location",
      parameters: [{ name: "location", type: "string", description: "City name or coordinates (lat,lon)", required: true }] },
    { id: "weather_forecast", name: "Weather Forecast", description: "Get weather forecast for upcoming days",
      parameters: [{ name: "location", type: "string", description: "City name or coordinates", required: true }, { name: "days", type: "number", description: "Number of forecast days (1-7)" }] },
  ],
};

export class WeatherInstance extends BaseIntegration<WeatherConfig> {
  async connect(): Promise<void> { this.status = "connected"; }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  private async geocode(location: string): Promise<{ lat: number; lon: number; name: string }> {
    if (location.includes(",")) {
      const [lat, lon] = location.split(",").map(Number);
      return { lat, lon, name: location };
    }
    const result = await this.apiFetch<{ results: { latitude: number; longitude: number; name: string }[] }>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`
    );
    if (!result.results?.length) throw new Error(`Location not found: ${location}`);
    const r = result.results[0];
    return { lat: r.latitude, lon: r.longitude, name: r.name };
  }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    const geo = await this.geocode(args.location as string);
    switch (skillId) {
      case "weather_current": {
        const w = await this.apiFetch<{ current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number } }>(
          `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=celsius`
        );
        const c = w.current;
        return { success: true, output: `Weather in ${geo.name}:\nTemp: ${c.temperature_2m}°C\nHumidity: ${c.relative_humidity_2m}%\nWind: ${c.wind_speed_10m} km/h`, data: w };
      }
      case "weather_forecast": {
        const days = (args.days as number) || 3;
        const w = await this.apiFetch<{ daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[] } }>(
          `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=${days}&temperature_unit=celsius`
        );
        const forecast = w.daily.time.map((t, i) => `${t}: ${w.daily.temperature_2m_min[i]}°C — ${w.daily.temperature_2m_max[i]}°C`).join("\n");
        return { success: true, output: `Forecast for ${geo.name}:\n${forecast}`, data: w };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
