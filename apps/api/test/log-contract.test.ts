// The api's call sites against the privacy rule (ADR 0032): ids, codes, counts and timings only. The logger here is
// uncensored, so each line is exactly what the call site passed and the tests check its keys, not the censor (which
// log-censor tests cover in the integrations package). A call site that started to pass a path, a query, a name or an
// error message would add a key or a value, and fail.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, ORIGIN, type TestAgency, type TestServer } from "./support/test-server.js";
import { mutate, query } from "./support/trpc.js";

const keysOf = (line: Record<string, unknown> | undefined) => Object.keys(line ?? {}).sort();

describe("the api's log lines", () => {
  const logger = createMemoryLogger({ censor: false });
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer({}, { logger });
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("a request line holds the request id, method, route, status, time, and the organization and user once known", async () => {
    const owner = await signedInOwner(server, agency);
    logger.entries.length = 0;
    await query(server, "me.get", owner, { search: "jane.doe@example.com", phone: "9876543210" });
    expect(keysOf(logger.entries[0])).toEqual([
      "durationMs",
      "level",
      "method",
      "msg",
      "organizationId",
      "procedures",
      "requestId",
      "route",
      "status",
      "userId",
    ]);
    expect(JSON.stringify(logger.entries)).not.toMatch(/jane|9876543210/);
  });

  it("a refusal adds only its status code and reason", async () => {
    const sales = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "sunil", roleKey: "sales" }),
    );
    logger.entries.length = 0;
    await mutate(server, "settings.setTwoFactorRequirement", { required: false }, sales);
    expect(keysOf(logger.entries[0])).toEqual([
      "durationMs",
      "level",
      "method",
      "msg",
      "organizationId",
      "procedures",
      "reason",
      "refusalCode",
      "requestId",
      "route",
      "status",
      "userId",
    ]);
  });

  it("a public route's line has no token, and a health check no ids", async () => {
    logger.entries.length = 0;
    await server.app.request(`/p/${"a".repeat(65)}?email=jane.doe@example.com`, {
      headers: { "x-forwarded-for": "203.0.113.77" },
    });
    await server.app.request("/health");
    expect(keysOf(logger.entries[0])).toEqual(["durationMs", "level", "method", "msg", "requestId", "route", "status"]);
    expect(logger.entries[0]?.route).toBe("/p/:token");
    expect(keysOf(logger.entries[1])).toEqual(["durationMs", "level", "method", "msg", "requestId", "route", "status"]);
  });

  it("Better Auth's lines hold the request id, its source and either a known sentence or 'withheld', never the input", async () => {
    logger.entries.length = 0;
    await server.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ email: "jane.doe@example.com", password: "hunter2-hunter2" }),
    });
    await server.app.request("/api/auth/sign-in/org", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ orgCode: agency.code, username: "jane.doe", password: "wrong-password-1" }),
    });
    const auth = logger.entries.filter((entry) => entry.source === "better-auth");
    expect(auth.length).toBeGreaterThan(0);
    for (const line of auth) {
      expect(keysOf(line)).toEqual(["level", "msg", "requestId", "source"]);
      expect(line.msg).toMatch(/^auth: [A-Za-z :.]+$|^auth: Invalid origin: https:\/\/evil\.example$/);
    }
    expect(JSON.stringify(logger.entries)).not.toMatch(/jane|hunter2|wrong-password/);
  });
});
