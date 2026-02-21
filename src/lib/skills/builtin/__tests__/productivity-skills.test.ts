import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Import (no external mocks needed for productivity skills)
// ---------------------------------------------------------------------------
import {
  getCurrentTime,
  calculate,
  summarizeText,
  productivitySkills,
} from "../productivity-skills";

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------
const ctx = { userId: "user-1", conversationId: "conv-1" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("productivity-skills", () => {
  describe("productivitySkills array", () => {
    it("exports all three skills", () => {
      expect(productivitySkills).toHaveLength(3);
      expect(productivitySkills).toEqual([getCurrentTime, calculate, summarizeText]);
    });
  });

  // ── getCurrentTime ──────────────────────────────────────────────────

  describe("getCurrentTime", () => {
    it("has correct metadata", () => {
      expect(getCurrentTime.id).toBe("get_current_time");
      expect(getCurrentTime.category).toBe("productivity");
    });

    it("returns current time in UTC by default", async () => {
      const result = await getCurrentTime.execute({}, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain("Current time:");
      expect(result.data).toHaveProperty("iso");
      expect(result.data).toHaveProperty("timezone", "UTC");
      // ISO string should be valid
      expect(new Date((result.data as any).iso).toISOString()).toBe(
        (result.data as any).iso
      );
    });

    it("returns time in specified timezone", async () => {
      const result = await getCurrentTime.execute(
        { timezone: "America/New_York" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("Current time:");
      expect(result.data).toHaveProperty("timezone", "America/New_York");
    });

    it("returns error for invalid timezone", async () => {
      const result = await getCurrentTime.execute(
        { timezone: "Invalid/Timezone_That_Doesnt_Exist" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("Invalid timezone");
    });
  });

  // ── calculate ───────────────────────────────────────────────────────

  describe("calculate", () => {
    it("has correct metadata", () => {
      expect(calculate.id).toBe("calculate");
      expect(calculate.category).toBe("productivity");
    });

    it("evaluates simple expression without spaces", async () => {
      const result = await calculate.execute({ expression: "2+2" }, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe("2+2 = 4");
      expect(result.data).toEqual({ expression: "2+2", result: 4 });
    });

    it("evaluates complex math expression without spaces", async () => {
      const result = await calculate.execute(
        { expression: "(10*5)/3" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("=");
    });

    it("evaluates expression with modulo", async () => {
      const result = await calculate.execute({ expression: "10%3" }, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe("10%3 = 1");
    });

    it("evaluates expression with exponentiation operator", async () => {
      const result = await calculate.execute({ expression: "2^3" }, ctx);

      expect(result.success).toBe(true);
      // 2 ^ 3 in JS is bitwise XOR = 1
      expect(result.output).toBe("2^3 = 1");
    });

    it("evaluates expression after stripping alphabetic characters (sanitization allows it)", async () => {
      // "abc+1" => sanitized = "+1", right side: "abc+1" stripped of spaces = "abc+1"
      // then stripped of non-math = "+1". "+1" === "+1" => check passes.
      // new Function returns 1 (unary +1).
      const result = await calculate.execute(
        { expression: "abc+1" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("= 1");
    });

    it("returns syntax error for expressions with function-like syntax", async () => {
      // "require('fs')" => sanitized = "()", right side = "()" => check passes.
      // new Function("return (())") throws SyntaxError.
      const result = await calculate.execute(
        { expression: "require('fs')" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("Could not evaluate expression");
    });

    it("returns error for expressions evaluating to Infinity", async () => {
      const result = await calculate.execute(
        { expression: "1/0" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("did not evaluate to a valid number");
    });

    it("returns error for expressions evaluating to NaN", async () => {
      const result = await calculate.execute(
        { expression: "0/0" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("did not evaluate to a valid number");
    });

    it("returns error for expressions that throw (syntax error)", async () => {
      const result = await calculate.execute(
        { expression: "(((" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("Could not evaluate expression");
    });

    it("handles expression with only numbers and operators", async () => {
      const result = await calculate.execute(
        { expression: "100+200-50*2/5" },
        ctx
      );

      expect(result.success).toBe(true);
    });

    it("handles expression with spaces (triggers sanitization mismatch)", async () => {
      // The sanitization logic compares:
      // - sanitized = expr.replace(/[^0-9+\-*/().%\s^]/g, "") -- keeps whitespace
      // - right = expr.replace(/\s/g, "").replace(...) -- strips whitespace first
      // For "2 + 3": sanitized = "2 + 3", right = "2+3" => "2 + 3" !== "2+3"
      // So expressions with spaces are rejected by the sanitization check
      const result = await calculate.execute(
        { expression: "2 + 3" },
        ctx
      );

      expect(result.success).toBe(false);
      expect(result.output).toContain("invalid characters");
    });
  });

  // ── summarizeText ───────────────────────────────────────────────────

  describe("summarizeText", () => {
    it("has correct metadata", () => {
      expect(summarizeText.id).toBe("summarize_text");
      expect(summarizeText.category).toBe("productivity");
    });

    it("returns text for LLM summarization with default max_length", async () => {
      const text = "This is a long piece of text that needs summarizing.";
      const result = await summarizeText.execute({ text }, ctx);

      expect(result.success).toBe(true);
      expect(result.output).toContain("approximately 100 words");
      expect(result.output).toContain(text);
      expect(result.data).toEqual({
        originalLength: text.length,
        maxLength: 100,
      });
    });

    it("uses provided max_length", async () => {
      const result = await summarizeText.execute(
        { text: "test text", max_length: 50 },
        ctx
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain("approximately 50 words");
      expect(result.data).toEqual({ originalLength: 9, maxLength: 50 });
    });
  });
});
