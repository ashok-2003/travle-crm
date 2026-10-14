// Platform staff (spec 6.1): user role "admin" and no organization. They reach platform procedures, organization
// staff don't, and impersonation (at most an hour) makes the admin act as the user, never as platform staff.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { createPlatformAdmin, signedInOwner } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, query, refusalOf } from "./support/trpc.js";

describe("platform staff", () => {
  let server: TestServer;
  let agency: TestAgency;
  let admin: { userId: string; email: string; password: string };

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    admin = await createPlatformAdmin(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("reach platform procedures, and organization staff don't", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, admin.email, admin.password);
    expect(await dataOf(await query(server, "platform.whoAmI", jar))).toEqual({
      userId: admin.userId,
      name: "Platform support",
    });
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).isPlatformAdmin).toBe(true);
    expect(await refusalOf(await query(server, "platform.whoAmI", await signedInOwner(server, agency)))).toEqual({
      status: 403,
      reason: "PLATFORM_ONLY",
    });
  });

  it("are not organization members", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, admin.email, admin.password);
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({ status: 403, reason: "NOT_A_MEMBER" });
  });

  it("can impersonate a user for an hour, acting as them and not as platform staff", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, admin.email, admin.password);
    const start = jar.absorb(
      await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar),
    );
    expect(start.status).toBe(200);

    const me = await dataOf<MeOutput>(await query(server, "me.get", jar));
    expect(me).toMatchObject({ impersonatedBy: admin.userId, isPlatformAdmin: false });
    expect(me.user.id).toBe(agency.owner.userId);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    expect((await query(server, "platform.whoAmI", jar)).status).toBe(403);
    const session = await server.platform.session.findFirstOrThrow({
      where: { userId: agency.owner.userId, impersonatedBy: admin.userId },
    });
    expect(session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);

    jar.absorb(await postJson(server, "/api/auth/admin/stop-impersonating", {}, jar));
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).user.id).toBe(admin.userId);
  });

  it("can't be impersonated into by organization staff", async () => {
    const owner = await signedInOwner(server, agency);
    const attempt = await postJson(server, "/api/auth/admin/impersonate-user", { userId: admin.userId }, owner);
    expect(attempt.status).toBe(403);
  });
});
