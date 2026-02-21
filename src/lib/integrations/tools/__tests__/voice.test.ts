const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

import { VoiceInstance, voiceIntegration } from "@/lib/integrations/tools/voice";

describe("VoiceInstance", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("definition", () => {
    it("should have correct metadata", () => {
      expect(voiceIntegration.id).toBe("voice");
      expect(voiceIntegration.category).toBe("tools");
      expect(voiceIntegration.skills.length).toBe(1);
    });
  });

  describe("connect", () => {
    it("should connect with browser provider without API key", async () => {
      const inst = new VoiceInstance(voiceIntegration, { provider: "browser" });
      await inst.connect();
      expect(inst.status).toBe("connected");
    });

    it("should throw for elevenlabs without API key", async () => {
      const inst = new VoiceInstance(voiceIntegration, { provider: "elevenlabs" });
      await expect(inst.connect()).rejects.toThrow("API key required");
    });

    it("should connect with elevenlabs with API key", async () => {
      const inst = new VoiceInstance(voiceIntegration, { provider: "elevenlabs", apiKey: "key" });
      await inst.connect();
      expect(inst.status).toBe("connected");
    });
  });

  describe("disconnect", () => {
    it("should disconnect", async () => {
      const inst = new VoiceInstance(voiceIntegration, { provider: "browser" });
      await inst.connect();
      await inst.disconnect();
      expect(inst.status).toBe("disconnected");
    });
  });

  describe("executeSkill (connected)", () => {
    it("should speak with elevenlabs provider when API succeeds", async () => {
      const inst = new VoiceInstance(voiceIntegration, { provider: "elevenlabs", apiKey: "key" });
      await inst.connect();
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await inst.executeSkill("voice_speak", { text: "Hello world" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("ElevenLabs");
    });

    it("should fallback when elevenlabs API fails", async () => {
      const inst = new VoiceInstance(voiceIntegration, { provider: "elevenlabs", apiKey: "key" });
      await inst.connect();
      mockFetch.mockResolvedValueOnce({ ok: false });
      const result = await inst.executeSkill("voice_speak", { text: "Hello world" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Speaking:");
    });

    it("should speak with browser provider", async () => {
      const inst = new VoiceInstance(voiceIntegration, { provider: "browser" });
      await inst.connect();
      const result = await inst.executeSkill("voice_speak", { text: "Hello world" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("Speaking:");
    });

    it("should return error for unknown skill", async () => {
      const inst = new VoiceInstance(voiceIntegration, { provider: "browser" });
      await inst.connect();
      const result = await inst.executeSkill("voice_unknown", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("not found");
    });

    it("should return error for unhandled skill in handleSkill", async () => {
      const inst = new VoiceInstance(voiceIntegration, { provider: "browser" });
      await inst.connect();
      const result = await (inst as any).handleSkill("nonexistent_skill", {});
      expect(result.success).toBe(false);
      expect(result.output).toContain("Unknown skill");
    });

    describe("configurable voice ID and model", () => {
      afterEach(() => {
        delete process.env.ELEVENLABS_VOICE_ID;
        delete process.env.ELEVENLABS_MODEL;
      });

      it("should use config voiceId and model when provided", async () => {
        const inst = new VoiceInstance(voiceIntegration, {
          provider: "elevenlabs",
          apiKey: "key",
          voiceId: "custom-voice-id",
          model: "eleven_multilingual_v2",
        });
        await inst.connect();
        mockFetch.mockResolvedValueOnce({ ok: true });

        await inst.executeSkill("voice_speak", { text: "Hello" });

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain("custom-voice-id");
        expect(url).not.toContain("21m00Tcm4TlvDq8ikWAM");
        const body = JSON.parse(options.body);
        expect(body.model_id).toBe("eleven_multilingual_v2");
      });

      it("should use ELEVENLABS_VOICE_ID env var when config not provided", async () => {
        process.env.ELEVENLABS_VOICE_ID = "env-voice-id";
        process.env.ELEVENLABS_MODEL = "env-model";
        const inst = new VoiceInstance(voiceIntegration, { provider: "elevenlabs", apiKey: "key" });
        await inst.connect();
        mockFetch.mockResolvedValueOnce({ ok: true });

        await inst.executeSkill("voice_speak", { text: "Hello" });

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain("env-voice-id");
        const body = JSON.parse(options.body);
        expect(body.model_id).toBe("env-model");
      });

      it("should use default voice ID and model when neither config nor env var is set", async () => {
        const inst = new VoiceInstance(voiceIntegration, { provider: "elevenlabs", apiKey: "key" });
        await inst.connect();
        mockFetch.mockResolvedValueOnce({ ok: true });

        await inst.executeSkill("voice_speak", { text: "Hello" });

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain("21m00Tcm4TlvDq8ikWAM");
        const body = JSON.parse(options.body);
        expect(body.model_id).toBe("eleven_monolingual_v1");
      });

      it("should prefer config over env var", async () => {
        process.env.ELEVENLABS_VOICE_ID = "env-voice-id";
        process.env.ELEVENLABS_MODEL = "env-model";
        const inst = new VoiceInstance(voiceIntegration, {
          provider: "elevenlabs",
          apiKey: "key",
          voiceId: "config-voice-id",
          model: "config-model",
        });
        await inst.connect();
        mockFetch.mockResolvedValueOnce({ ok: true });

        await inst.executeSkill("voice_speak", { text: "Hello" });

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toContain("config-voice-id");
        const body = JSON.parse(options.body);
        expect(body.model_id).toBe("config-model");
      });
    });
  });
});
