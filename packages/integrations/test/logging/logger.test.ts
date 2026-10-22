// The Logger port's privacy rule (spec 9.1): ids, codes, counts and timings only. Both adapters censor the same way, so
// a test on the in-memory one holds for the real one, and the real one is also read as the JSON line it writes.
import { describe, expect, it } from "vitest";
import { createMemoryLogger, createPinoLogger, errorFields } from "../../src/logging/index.js";

const email = "jane.doe@example.com";
const phone = "+91 98765 43210";

/** The real adapter, writing to an array of parsed JSON lines. */
function realLogger(level: "debug" | "info" | "warn" | "error" = "debug") {
  const lines: Record<string, unknown>[] = [];
  const logger = createPinoLogger({
    process: "api",
    level,
    destination: {
      write: (line: string) => {
        lines.push(JSON.parse(line) as Record<string, unknown>);
      },
    },
  });
  return { logger, lines };
}

describe("the censor's rules", () => {
  const censored = (fields: Record<string, unknown>): Record<string, unknown> => {
    const memory = createMemoryLogger();
    memory.info(fields, "x");
    return memory.entries[0] ?? {};
  };

  it("censors key names, not words that happen to end alike: context and sortKey stay, apiKey and text go", () => {
    expect(censored({ context: "request", sortKey: "createdAt", statusText: "ok", contentLength: 12 })).toMatchObject({
      context: "request",
      sortKey: "createdAt",
      statusText: "ok",
      contentLength: 12,
    });
    expect(censored({ key: "k", apiKey: "k", text: "t", content: "c", secretKey: "s" })).toMatchObject({
      key: "[redacted]",
      apiKey: "[redacted]",
      text: "[redacted]",
      content: "[redacted]",
      secretKey: "[redacted]",
    });
  });

  it("masks a phone number held as a number, under any key", () => {
    expect(censored({ contact: 9876543210, rows: 120, durationMs: 4_500_000 })).toMatchObject({
      contact: "[number]",
      rows: 120,
      durationMs: 4_500_000,
    });
  });

  it("keeps only a stack errorFields made: a plain string under that key is masked like any other", () => {
    const real = errorFields(new Error("x"));
    expect(String(censored({ ...real }).errorStack)).toBe(String(real.errorStack));
    expect(censored({ errorStack: `at jane.doe@example.com 9876543210` }).errorStack).toBe("at [email] [number]");
  });
});

describe("errorFields", () => {
  it("takes only real frames, even when the error was renamed after its stack was made", () => {
    class Renamed extends Error {}
    const error = new Renamed(`bad ${email}\n    at fake (not-a-frame.js)\n    at injected jane`);
    error.name = "SomethingElse";
    const fields = errorFields(error);
    expect(fields.errorName).toBe("SomethingElse");
    const frames = String(fields.errorStack);
    expect(frames).toMatch(/^\s*at /);
    expect(frames).not.toContain("jane");
    expect(frames).not.toContain("not-a-frame");
    expect(frames).not.toContain("injected");
  });

  it("gives the name, code, causes and stack frames, never the message", () => {
    const cause = Object.assign(new Error(`row for ${email}`), { code: "ECONNREFUSED" });
    const error = Object.assign(new TypeError(`bad ${email}\n    at fake (not-a-frame.js:1:1)`, { cause }), {
      code: "P2002",
    });
    const fields = errorFields(error);
    expect(fields).toMatchObject({ errorName: "TypeError", errorCode: "P2002", errorCause: "Error ECONNREFUSED" });
    expect(String(fields.errorStack)).toMatch(/^\s*at /);
    expect(JSON.stringify(fields)).not.toContain("jane");
    expect(JSON.stringify(fields)).not.toContain("not-a-frame");
  });

  it("describes anything that is not an Error by its type alone", () => {
    expect(errorFields(email)).toEqual({ errorName: "string" });
    expect(errorFields({ message: email, code: "E1" })).toEqual({ errorName: "Error", errorCode: "E1" });
  });
});

describe.each([
  ["the real adapter", () => realLogger()],
  [
    "the in-memory adapter",
    () => {
      const memory = createMemoryLogger();
      return { logger: memory, lines: memory.entries };
    },
  ],
])("%s", (_name, make) => {
  it("keeps ids, codes, counts and timings", () => {
    const { logger, lines } = make();
    const organizationId = "0199e7a1-1234-7890-8123-456789012345";
    logger.info({ organizationId, rows: 12, durationMs: 45, code: "LEAD_NOT_FOUND" }, "lead refused");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ organizationId, rows: 12, durationMs: 45, code: "LEAD_NOT_FOUND" });
  });

  it("censors personal keys at any depth, and personal text in any value or message", () => {
    const { logger, lines } = make();
    logger.warn(
      {
        email,
        phone,
        fullName: "Jane Doe",
        password: "hunter2",
        headers: { cookie: "a=b", authorization: "Bearer x" },
        nested: { deeper: [{ token: "t0k3n", note: `call ${phone} or write ${email}` }] },
        search: "Jane",
        q: "Jane",
        body: { a: 1 },
        url: "/api/leads?phone=9876543210",
        apiKey: "k",
      },
      `failed for ${email}`,
    );
    const written = JSON.stringify(lines);
    for (const secret of ["jane", "Jane", "98765", "hunter2", "Bearer", "t0k3n", "a=b", "9876543210"]) {
      expect(written).not.toContain(secret);
    }
  });

  it("writes an Error passed as a field without its message", () => {
    const { logger, lines } = make();
    logger.error({ cause: new Error(`no mailbox for ${email}`) }, "send failed");
    expect(JSON.stringify(lines)).not.toContain("jane");
  });

  it("keeps a stack's frames whole, package paths with an @ in them included", () => {
    const { logger, lines } = make();
    const error = new Error(`no mailbox for ${email}`);
    error.stack = `Error: no mailbox for ${email}\n    at run (file:///app/node_modules/.pnpm/pg-boss@12.37.1_pg@8.20.0/node_modules/pg-boss/dist/index.js:655:19)`;
    logger.error({ ...errorFields(error) }, "job failed");
    expect(JSON.stringify(lines)).toContain("pg-boss@12.37.1_pg@8.20.0");
    expect(JSON.stringify(lines)).not.toContain("jane");
  });

  it("carries a child's bindings on every line", () => {
    const { logger, lines } = make();
    logger.child({ requestId: "r1" }).child({ organizationId: "o1" }).info({ status: 200 }, "request");
    expect(lines[0]).toMatchObject({ requestId: "r1", organizationId: "o1", status: 200 });
  });
});

describe("the uncensored in-memory adapter", () => {
  it("keeps exactly what a call site passed, so a contract test can see personal data it should not have passed", () => {
    const raw = createMemoryLogger({ censor: false });
    raw.info({ email, requestId: "r1" }, `for ${email}`);
    expect(raw.entries[0]).toMatchObject({ email, requestId: "r1", msg: `for ${email}` });
    raw.child({ phone }).info({}, "child");
    expect(raw.entries[1]).toMatchObject({ phone });
  });
});

describe("the real adapter's lines", () => {
  it("are JSON with level, ISO time, process, msg and the fields", () => {
    const { logger, lines } = realLogger();
    logger.info({ status: 200 }, "request");
    expect(lines[0]).toMatchObject({ level: "info", process: "api", msg: "request", status: 200 });
    expect(new Date(String(lines[0]?.time)).toISOString()).toBe(lines[0]?.time);
    expect(lines[0]).not.toHaveProperty("pid");
    expect(lines[0]).not.toHaveProperty("hostname");
  });

  it("drops lines below the level", () => {
    const { logger, lines } = realLogger("warn");
    logger.debug({}, "d");
    logger.info({}, "i");
    logger.warn({}, "w");
    logger.error({}, "e");
    expect(lines.map((line) => line.level)).toEqual(["warn", "error"]);
  });
});
