// Sign-in attempts are rate limited per client address (spec 6.2): Better Auth allows 3 per 10 seconds per path.
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi, type MockInstance } from "vitest";
import {
  createTestAgency,
  createTestServer,
  postJson,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";

/** Each attempt that reaches Better Auth warns once that the user is unknown; a refused (429) attempt never gets there. */
function expectUnknownUserWarnings(warn: MockInstance, count: number): void {
  expect(warn).toHaveBeenCalledTimes(count);
  for (let call = 1; call <= count; call++) {
    expect(warn).toHaveBeenNthCalledWith(call, expect.stringContaining("User not found"));
  }
}

describe("sign-in rate limiting", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer({ rateLimit: true });
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("refuses the fourth attempt in 10 seconds from one address, and only from that address", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    const attempt = (address: string) =>
      postJson(
        server,
        "/api/auth/sign-in/org",
        { orgCode: agency.code, username: "nobody", password: "wrong-password-1" },
        undefined,
        { "x-forwarded-for": address },
      );
    const statuses: number[] = [];
    for (let count = 0; count < 5; count++) statuses.push((await attempt("203.0.113.9")).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    expect((await attempt("198.51.100.7")).status).toBe(401);
    expectUnknownUserWarnings(warn, 4);
  });

  it("counts clients separately behind a trusted proxy that appends to x-forwarded-for", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    const proxied = createTestServer({ rateLimit: true, trustedProxies: ["10.0.0.1"] });
    try {
      const attempt = (client: string) =>
        postJson(
          proxied,
          "/api/auth/sign-in/org",
          { orgCode: agency.code, username: "nobody", password: "wrong-password-1" },
          undefined,
          { "x-forwarded-for": `${client}, 10.0.0.1` },
        );
      const statuses: number[] = [];
      for (let count = 0; count < 4; count++) statuses.push((await attempt("192.0.2.40")).status);
      expect(statuses).toEqual([401, 401, 401, 429]);
      expect((await attempt("192.0.2.41")).status).toBe(401);
      expectUnknownUserWarnings(warn, 4);
    } finally {
      await proxied.close();
    }
  });
});
