// A member's last activity, which the platform dashboard shows (spec 7.4): a request a member makes through an
// organization procedure notes it on the member, at most once a day, so a busy member costs one write a day.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addStaff, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { query } from "./support/trpc.js";

const HOUR_MS = 60 * 60 * 1000;

describe("a member's last activity", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  const lastActiveAt = async (memberId: string) =>
    (await server.platform.member.findUniqueOrThrow({ where: { id: memberId } })).lastActiveAt;

  it("is noted by a member's request, not again by another the same day, and again a day later", async () => {
    const ravi = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, ravi);
    // Signing in alone isn't using the app.
    expect(await lastActiveAt(ravi.memberId)).toBeNull();

    const before = Date.now();
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    const first = await lastActiveAt(ravi.memberId);
    expect(first?.getTime()).toBeGreaterThanOrEqual(before);

    expect((await query(server, "roles.list", jar)).status).toBe(200);
    expect(await lastActiveAt(ravi.memberId)).toEqual(first);

    const dayAgo = new Date(Date.now() - 25 * HOUR_MS);
    await server.platform.member.update({ where: { id: ravi.memberId }, data: { lastActiveAt: dayAgo } });
    const later = Date.now();
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    expect((await lastActiveAt(ravi.memberId))?.getTime()).toBeGreaterThanOrEqual(later);
  });
});
