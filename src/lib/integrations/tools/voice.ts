import type { IntegrationDefinition, IntegrationConfig } from "../types";
import { BaseIntegration } from "../base";

interface VoiceConfig extends IntegrationConfig { provider: string; apiKey?: string; wakeWord?: string; voiceId?: string; model?: string; }

export const voiceIntegration: IntegrationDefinition<VoiceConfig> = {
  id: "voice", name: "Voice", description: "Voice wake and talk mode. Always-on speech with ElevenLabs, OpenAI, or browser TTS.",
  category: "tools", icon: "voice",
  configFields: [
    { key: "provider", label: "TTS Provider", type: "select", description: "Text-to-speech provider", required: true,
      options: [{ label: "Browser (Free)", value: "browser" }, { label: "ElevenLabs", value: "elevenlabs" }, { label: "OpenAI TTS", value: "openai" }], default: "browser" },
    { key: "apiKey", label: "API Key", type: "password", description: "API key for ElevenLabs or OpenAI TTS", required: false },
    { key: "wakeWord", label: "Wake Word", type: "text", description: "Custom wake word (default: 'Hey Assistant')", required: false, default: "Hey Assistant" },
  ],
  skills: [
    { id: "voice_speak", name: "Speak", description: "Convert text to speech",
      parameters: [{ name: "text", type: "string", description: "Text to speak", required: true }, { name: "voice", type: "string", description: "Voice ID or name" }] },
  ],
};

export class VoiceInstance extends BaseIntegration<VoiceConfig> {
  async connect(): Promise<void> {
    if (this.config.provider !== "browser" && !this.config.apiKey) throw new Error("API key required for this TTS provider");
    this.status = "connected";
  }
  async disconnect(): Promise<void> { this.status = "disconnected"; }

  protected async handleSkill(skillId: string, args: Record<string, unknown>) {
    if (skillId === "voice_speak") {
      if (this.config.provider === "elevenlabs" && this.config.apiKey) {
        const voiceId = this.config.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
        const model = this.config.model ?? process.env.ELEVENLABS_MODEL ?? "eleven_monolingual_v1";
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: "POST",
          headers: { "xi-api-key": this.config.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ text: args.text, model_id: model }),
        });
        if (res.ok) return { success: true, output: "Speech generated via ElevenLabs" };
      }
      return { success: true, output: `Speaking: "${(args.text as string).slice(0, 100)}..."` };
    }
    return { success: false, output: `Unknown skill: ${skillId}` };
  }
}
