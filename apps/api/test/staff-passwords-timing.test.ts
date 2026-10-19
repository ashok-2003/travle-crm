// Hashing a staff import's temporary passwords (B46): 25 a call, with Better Auth's real hasher, takes about 70 ms each,
// and a call of 25 stays within 5 s. The event loop keeps turning meanwhile, so one importer's passwords don't stall
// everyone else's requests.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestServer, type TestServer } from "./support/test-server.js";

describe("hashing a call's temporary passwords", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("hashes 25 passwords a call within 5 s", async () => {
    const passwords = Array.from({ length: 25 }, (_, index) => `Timing-pass-${String(index)}-Zq7Kx`);
    // The hasher's first use loads its key-derivation code.
    await server.identity.staff.hashTemporaryPasswords(["warm-up-pass-1"]);
    const started = performance.now();
    const hashes = await server.identity.staff.hashTemporaryPasswords(passwords);
    const ms = performance.now() - started;
    console.info("25 passwords hashed in", Math.round(ms), "ms");
    expect(hashes).toHaveLength(25);
    expect(new Set(hashes).size).toBe(25);
    expect(ms).toBeLessThan(5000);
  });

  it("leaves the event loop turning while it hashes", async () => {
    let longest = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
    }, 20);
    await server.identity.staff.hashTemporaryPasswords(
      Array.from({ length: 10 }, (_, index) => `Loop-pass-${String(index)}-x`),
    );
    clearInterval(timer);
    console.info("longest wait of the event loop:", Math.round(longest), "ms");
    // One hash takes about 70 ms: no wait is longer than a few of them.
    expect(longest).toBeLessThan(400);
  });
});
