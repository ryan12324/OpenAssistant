import type { SkillDefinition } from "../types";

export const getCurrentTime: SkillDefinition = {
  id: "get_current_time",
  name: "Get Current Time",
  description: "Get the current date and time.",
  category: "productivity",
  parameters: [
    {
      name: "timezone",
      type: "string",
      description: "IANA timezone (e.g. America/New_York). Defaults to UTC.",
    },
  ],
  async execute(args) {
    const tz = (args.timezone as string) || "UTC";
    try {
      const now = new Date();
      const formatted = now.toLocaleString("en-US", {
        timeZone: tz,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
      return {
        success: true,
        output: `Current time: ${formatted}`,
        data: { iso: now.toISOString(), timezone: tz },
      };
    } catch {
      return {
        success: false,
        output: `Invalid timezone: ${tz}`,
      };
    }
  },
};

export const calculate: SkillDefinition = {
  id: "calculate",
  name: "Calculate",
  description: "Evaluate a mathematical expression.",
  category: "productivity",
  parameters: [
    {
      name: "expression",
      type: "string",
      description: "The mathematical expression to evaluate (e.g., '2 + 2', '(10 * 5) / 3')",
      required: true,
    },
  ],
  async execute(args) {
    const expr = args.expression as string;

    // Safe math evaluation - only allow math characters
    const sanitized = expr.replace(/[^0-9+\-*/().%\s^]/g, "");
    if (sanitized !== expr.replace(/\s/g, "").replace(/[^0-9+\-*/().%\s^]/g, "")) {
      return {
        success: false,
        output: "Expression contains invalid characters. Only numbers and math operators are allowed.",
      };
    }

    try {
      // Use Function constructor for safe math evaluation
      const result = new Function(`"use strict"; return (${sanitized})`)();
      if (typeof result !== "number" || !isFinite(result)) {
        return {
          success: false,
          output: "Expression did not evaluate to a valid number.",
        };
      }
      return {
        success: true,
        output: `${expr} = ${result}`,
        data: { expression: expr, result },
      };
    } catch {
      return {
        success: false,
        output: `Could not evaluate expression: ${expr}`,
      };
    }
  },
};

export const summarizeText: SkillDefinition = {
  id: "summarize_text",
  name: "Summarize Text",
  description: "Create a concise summary of a long piece of text. Useful for condensing information.",
  category: "productivity",
  parameters: [
    {
      name: "text",
      type: "string",
      description: "The text to summarize",
      required: true,
    },
    {
      name: "max_length",
      type: "number",
      description: "Approximate maximum length of the summary in words",
    },
  ],
  async execute(args) {
    // This skill returns the text for the LLM to summarize in its response
    const text = args.text as string;
    const maxLength = (args.max_length as number) || 100;

    return {
      success: true,
      output: `Please summarize the following text in approximately ${maxLength} words:\n\n${text}`,
      data: { originalLength: text.length, maxLength },
    };
  },
};

export const productivitySkills = [getCurrentTime, calculate, summarizeText];
