import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface SpotifyConfig extends IntegrationConfig { clientId: string; clientSecret: string; refreshToken: string; }

export const spotifyIntegration: IntegrationDefinition<SpotifyConfig> = {
  id: "spotify", name: "Spotify", description: "Music playback control. Play, pause, skip, search, and manage playlists.",
  category: "music", icon: "spotify", website: "https://developer.spotify.com/",
  configFields: [
    { key: "clientId", label: "Client ID", type: "text", description: "Spotify OAuth client ID", required: true },
    { key: "clientSecret", label: "Client Secret", type: "password", description: "Spotify OAuth client secret", required: true },
    { key: "refreshToken", label: "Refresh Token", type: "password", description: "Spotify OAuth refresh token", required: true },
  ],
  skills: [
    { id: "spotify_play", name: "Play Music", description: "Play a track, album, or playlist",
      parameters: [{ name: "query", type: "string", description: "Song/artist/album to play", required: true }] },
    { id: "spotify_pause", name: "Pause", description: "Pause current playback", parameters: [] },
    { id: "spotify_skip", name: "Skip Track", description: "Skip to the next track", parameters: [] },
    { id: "spotify_current", name: "Now Playing", description: "Get currently playing track info", parameters: [] },
    { id: "spotify_search", name: "Search Spotify", description: "Search for music",
      parameters: [{ name: "query", type: "string", description: "Search query", required: true }, { name: "type", type: "string", description: "Type: track, artist, album, playlist" }] },
  ],
};

export class SpotifyInstance extends BaseIntegration<SpotifyConfig> {
  private accessToken = "";
  private readonly API = "https://api.spotify.com/v1";

  async connect(): Promise<void> {
    const res = await this.apiFetch<{ access_token: string }>("https://accounts.spotify.com/api/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${this.config.clientId}:${this.config.clientSecret}`)}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.config.refreshToken }).toString(),
    });
    this.accessToken = res.access_token;
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.accessToken = ""; this.status = "disconnected"; }

  private get headers() { return { Authorization: `Bearer ${this.accessToken}` }; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    switch (skillId) {
      case "spotify_play": {
        const search = await this.apiFetch<{ tracks: { items: { uri: string; name: string; artists: { name: string }[] }[] } }>(
          `${this.API}/search?q=${encodeURIComponent(args.query as string)}&type=track&limit=1`, { headers: this.headers }
        );
        const track = search.tracks.items[0];
        if (!track) return { success: false, output: `No results for "${args.query}"` };
        await fetch(`${this.API}/me/player/play`, { method: "PUT", headers: this.headers, body: JSON.stringify({ uris: [track.uri] }) });
        return { success: true, output: `Playing: ${track.name} by ${track.artists.map((a) => a.name).join(", ")}` };
      }
      case "spotify_pause": { await fetch(`${this.API}/me/player/pause`, { method: "PUT", headers: this.headers }); return { success: true, output: "Playback paused" }; }
      case "spotify_skip": { await fetch(`${this.API}/me/player/next`, { method: "POST", headers: this.headers }); return { success: true, output: "Skipped to next track" }; }
      case "spotify_current": {
        const res = await fetch(`${this.API}/me/player/currently-playing`, { headers: this.headers });
        if (res.status === 204) return { success: true, output: "Nothing is currently playing" };
        const data = await res.json() as { item: { name: string; artists: { name: string }[] } };
        return { success: true, output: `Now playing: ${data.item.name} by ${data.item.artists.map((a: { name: string }) => a.name).join(", ")}`, data };
      }
      case "spotify_search": {
        const type = (args.type as string) || "track";
        const result = await this.apiFetch<Record<string, { items: { name: string; id: string }[] }>>(
          `${this.API}/search?q=${encodeURIComponent(args.query as string)}&type=${type}&limit=5`, { headers: this.headers }
        );
        const items = result[`${type}s`]?.items || [];
        return { success: true, output: items.map((i) => `${i.name} (${i.id})`).join("\n"), data: items };
      }
      default: return { success: false, output: `Unknown skill: ${skillId}` };
    }
  }
}
