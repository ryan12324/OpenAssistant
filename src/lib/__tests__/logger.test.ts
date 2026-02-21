import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// maskSecret tests -- static export, no env dependency
// ---------------------------------------------------------------------------
describe("maskSecret", () => {
  let maskSecret: typeof import("@/lib/logger").maskSecret;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/logger");
    maskSecret = mod.maskSecret;
  });

  it('returns "" for non-string inputs', () => {
    expect(maskSecret(42 as unknown as string)).toBe("");
    expect(maskSecret(null as unknown as string)).toBe("");
    expect(maskSecret(undefined as unknown as string)).toBe("");
    expect(maskSecret(true as unknown as string)).toBe("");
  });

  it('returns "" for an empty string', () => {
    expect(maskSecret("")).toBe("");
  });

  it('returns "***" for strings with length <= 8', () => {
    expect(maskSecret("a")).toBe("***");
    expect(maskSecret("abcd")).toBe("***");
    expect(maskSecret("abc12345")).toBe("***"); // exactly 8
  });

  it("masks all but the last 4 characters for strings longer than 8", () => {
    // "sk-1234567890" has length 14 -> 10 stars + "7890"
    expect(maskSecret("sk-1234567890")).toBe("*********7890");
    // length 9 -> 5 stars + last 4
    expect(maskSecret("123456789")).toBe("*****6789");
  });
});

// ---------------------------------------------------------------------------
// getLogger tests -- default LOG_LEVEL (debug, all levels emit)
// ---------------------------------------------------------------------------
describe("getLogger (default LOG_LEVEL)", () => {
  let getLogger: typeof import("@/lib/logger").getLogger;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    delete process.env.LOG_LEVEL;
    const mod = await import("@/lib/logger");
    getLogger = mod.getLogger;

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a Logger with debug, info, warn, error, and child methods", () => {
    const logger = getLogger("test-module");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.child).toBe("function");
  });

  // --- individual level routing ---

  it("debug() writes to console.log", () => {
    const logger = getLogger("mod");
    logger.debug("hello");
    expect(logSpy).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("info() writes to console.log", () => {
    const logger = getLogger("mod");
    logger.info("hello");
    expect(logSpy).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("warn() writes to console.warn", () => {
    const logger = getLogger("mod");
    logger.warn("watch out");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("error() writes to console.error", () => {
    const logger = getLogger("mod");
    logger.error("boom");
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // --- JSON output structure ---

  it("outputs valid JSON with ts, level, module, and msg fields", () => {
    const logger = getLogger("my-module");
    logger.info("test message");

    const raw = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("ts");
    expect(parsed.level).toBe("info");
    expect(parsed.module).toBe("my-module");
    expect(parsed.msg).toBe("test message");
    // ts should be a valid ISO date string
    expect(new Date(parsed.ts).toISOString()).toBe(parsed.ts);
  });

  // --- context ---

  it("logs without context when none is provided", () => {
    const logger = getLogger("mod");
    logger.info("no ctx");
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    // only the standard keys should exist
    expect(Object.keys(parsed)).toEqual(
      expect.arrayContaining(["ts", "level", "module", "msg"])
    );
  });

  it("includes extra context fields when provided", () => {
    const logger = getLogger("mod");
    logger.info("with ctx", { requestId: "abc", userId: 7 });
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.requestId).toBe("abc");
    expect(parsed.userId).toBe(7);
  });

  // --- child logger ---

  it("child() creates a logger that merges parent context", () => {
    const parent = getLogger("svc");
    const child = parent.child({ requestId: "r1" });
    child.info("from child");

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.module).toBe("svc");
    expect(parsed.requestId).toBe("r1");
    expect(parsed.msg).toBe("from child");
  });

  it("child() context can be overridden by per-call context", () => {
    const parent = getLogger("svc");
    const child = parent.child({ env: "prod" });
    child.warn("override", { env: "staging" });

    const parsed = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(parsed.env).toBe("staging");
  });

  it("child() inherits and extends parent base context", () => {
    const parent = getLogger("svc");
    const child1 = parent.child({ a: 1 });
    const child2 = child1.child({ b: 2 });
    child2.info("deep child");

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed.a).toBe(1);
    expect(parsed.b).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Log-level filtering: LOG_LEVEL = "error"
// ---------------------------------------------------------------------------
describe("log level filtering (LOG_LEVEL=error)", () => {
  let getLogger: typeof import("@/lib/logger").getLogger;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "error";
    const mod = await import("@/lib/logger");
    getLogger = mod.getLogger;

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.LOG_LEVEL;
    vi.restoreAllMocks();
  });

  it("suppresses debug, info, and warn", () => {
    const logger = getLogger("mod");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("allows error to emit", () => {
    const logger = getLogger("mod");
    logger.error("e");
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Log-level filtering: LOG_LEVEL = "warn"
// ---------------------------------------------------------------------------
describe("log level filtering (LOG_LEVEL=warn)", () => {
  let getLogger: typeof import("@/lib/logger").getLogger;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "warn";
    const mod = await import("@/lib/logger");
    getLogger = mod.getLogger;

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.LOG_LEVEL;
    vi.restoreAllMocks();
  });

  it("suppresses debug and info", () => {
    const logger = getLogger("mod");
    logger.debug("d");
    logger.info("i");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("allows warn to emit", () => {
    const logger = getLogger("mod");
    logger.warn("w");
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("allows error to emit", () => {
    const logger = getLogger("mod");
    logger.error("e");
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
