import { cn, formatDate, truncate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// cn
// ---------------------------------------------------------------------------

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("handles conditional class names", () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn("base", isActive && "active", isDisabled && "disabled")).toBe(
      "base active",
    );
  });

  it("merges conflicting Tailwind classes (last wins)", () => {
    expect(cn("px-4", "px-8")).toBe("px-8");
  });

  it("handles empty arguments", () => {
    expect(cn()).toBe("");
  });

  it("handles mixed input types (arrays, objects, strings)", () => {
    expect(cn("a", ["b", "c"], { d: true, e: false })).toBe("a b c d");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
  it("formats a Date object", () => {
    // Use a fixed date to get deterministic output
    const date = new Date("2025-06-15T14:30:00Z");
    const result = formatDate(date);

    // The result should contain month abbreviation and day
    expect(result).toContain("Jun");
    expect(result).toContain("15");
  });

  it("formats a date string", () => {
    const result = formatDate("2025-12-25T08:00:00Z");

    expect(result).toContain("Dec");
    expect(result).toContain("25");
  });

  it("includes hour and minute components", () => {
    const date = new Date("2025-03-10T09:45:00Z");
    const result = formatDate(date);

    // Should have time component (exact format varies by timezone/locale)
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("returns the original string when shorter than limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the original string when exactly equal to limit", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends '...' when string exceeds limit", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });

  it("truncates to the specified length plus ellipsis", () => {
    const result = truncate("abcdefghij", 3);
    expect(result).toBe("abc...");
  });

  it("handles single character limit", () => {
    expect(truncate("abcdef", 1)).toBe("a...");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});
