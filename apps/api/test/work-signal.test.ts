// The worker's wake-up signal (docs/runbook.md, "Waking the worker at night"): the api writes the time to a file the host
// watches, at most once in 30 seconds, when work for the worker came in: a stored webhook, a signed-in person's change, a
// public form or share link taken. Reads, refusals of strangers and a failed write signal nothing, and never fail a request.
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { hmacSha256Signature, type WebhookRequest } from "@travel-crm/domain/webhooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkSignal, WRITE_GAP_MS } from "../src/work-signal.js";
import type { CookieJar } from "./support/cookie-jar.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, ORIGIN, type TestServer } from "./support/test-server.js";

/** Lets the signal's write (fire and forget) land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("the work signal", () => {
  let folder: string;
  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "work-signal-"));
  });
  afterAll(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("writes the time in seconds, then nothing more until 30 seconds have passed", async () => {
    const file = join(folder, "throttled");
    let now = 1_800_000_000_000;
    const signal = createWorkSignal({ file, logger: createMemoryLogger(), now: () => now });
    signal();
    await settle();
    expect(await readFile(file, "utf8")).toBe("1800000000\n");
    now += WRITE_GAP_MS - 1;
    signal();
    await settle();
    expect(await readFile(file, "utf8")).toBe("1800000000\n");
    now += 1;
    signal();
    await settle();
    expect(await readFile(file, "utf8")).toBe("1800000030\n");
  });

  it("logs a failed write once, as a warning, and never throws", async () => {
    const logger = createMemoryLogger();
    let now = 0;
    const signal = createWorkSignal({ file: join(folder, "missing", "at"), logger, now: () => now });
    expect(() => {
      signal();
    }).not.toThrow();
    await settle();
    now += WRITE_GAP_MS;
    signal();
    await settle();
    const warnings = logger.entries.filter((entry) => entry.msg === "The worker's wake-up signal could not be written");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.level).toBe("warn");
  });
});

describe("what signals work", () => {
  const secret = "work-signal-webhook-secret";
  let server: TestServer;
  let owner: CookieJar;
  let signals = 0;

  beforeAll(async () => {
    server = createTestServer(
      {},
      {
        // Counted, not throttled: each request that brought work counts once.
        signalWork: () => {
          signals += 1;
        },
        webhookProviders: [
          {
            name: "example",
            keptHeaders: [],
            verify: hmacSha256Signature({ secret, header: "x-example-signature", encoding: "hex" }),
            identify: ({ rawBody }: WebhookRequest) => ({
              eventId: (JSON.parse(rawBody) as { id: string }).id,
              eventType: "example.happened",
            }),
            process: () => Promise.resolve(),
          },
        ],
      },
    );
    owner = await signedInOwner(server, await createTestAgency(server));
  });
  afterAll(async () => {
    await server.close();
  });

  const call = (path: string, input: unknown, cookie?: string) =>
    server.app.request(`/api/trpc/${path}?batch=1`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ 0: input }),
    });
  const counted = async (request: () => Response | Promise<Response>) => {
    const before = signals;
    await request();
    return signals - before;
  };

  it("counts a signed-in person's change, refused or not, but not a read or a stranger's change", async () => {
    const rename = { destinationId: "0199e7a0-0000-7000-8000-0000000000d1", name: "Goa" };
    expect(await counted(() => call("destinations.rename", rename, owner.header))).toBe(1);
    expect(await counted(() => call("destinations.search", { query: "goa" }, owner.header))).toBe(0);
    expect(await counted(() => call("destinations.rename", rename))).toBe(0);
  });

  it("counts a webhook that was stored, not one refused", async () => {
    const body = JSON.stringify({ id: `evt_${crypto.randomUUID()}` });
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const deliver = (headers: Record<string, string>) =>
      server.app.request("/webhooks/example", { method: "POST", headers, body });
    expect(await counted(() => deliver({ "x-example-signature": signature }))).toBe(1);
    expect(await counted(() => deliver({ "x-example-signature": "wrong" }))).toBe(0);
  });
});

describe("the work signal's file", () => {
  it("is left alone when nothing signalled", async () => {
    const folder = await mkdtemp(join(tmpdir(), "work-signal-idle-"));
    createWorkSignal({ file: join(folder, "at"), logger: createMemoryLogger() });
    await settle();
    await expect(stat(join(folder, "at"))).rejects.toThrow();
    await rm(folder, { recursive: true, force: true });
  });
});
