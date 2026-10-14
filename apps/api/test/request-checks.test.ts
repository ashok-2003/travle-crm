// The request checks of spec 6.5 through the HTTP app: signed in (1), role permission (4), membership read on every
// request, fresh sessions for sensitive procedures (spec 6.4), and the steps a member must take before using the app.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("request checks", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("refuses calls without a session (check 1)", async () => {
    expect((await query(server, "me.get")).status).toBe(401);
    expect((await query(server, "settings.get")).status).toBe(401);
    expect((await query(server, "me.get", new CookieJar())).status).toBe(401);
  });

  it("tells a member who they are, their organization and what they may do", async () => {
    const ravi = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const me = await dataOf<MeOutput>(await query(server, "me.get", await signedInStaff(server, agency, ravi)));
    expect(me.user).toMatchObject({ id: ravi.userId, email: null, username: "ravi", twoFactorEnabled: false });
    expect(me.organization).toMatchObject({ id: agency.organizationId, code: agency.code, requireTwoFactor: false });
    expect(me.member?.role).toEqual({ key: "sales", name: "Sales", isOwner: false });
    expect(me.member?.permissions).toContainEqual({ permission: "leads:view", scope: "own" });
    expect(me).toMatchObject({ impersonatedBy: null, isPlatformAdmin: false, pendingStep: null });
  });

  it("lets a member read settings but only someone with settings:manage change them (check 4)", async () => {
    const sales = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "sunil", roleKey: "sales" }),
    );
    expect(await dataOf(await query(server, "settings.get", sales))).toEqual({ requireTwoFactor: false });
    expect(
      await refusalOf(await mutate(server, "settings.setTwoFactorRequirement", { required: false }, sales)),
    ).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    const owner = await signedInOwner(server, agency);
    expect((await mutate(server, "settings.setTwoFactorRequirement", { required: false }, owner)).status).toBe(200);
  });

  it("rejects malformed input with 400", async () => {
    const owner = await signedInOwner(server, agency);
    const response = await mutate(server, "settings.setTwoFactorRequirement", { required: "yes" }, owner);
    expect(response.status).toBe(400);
  });

  it("refuses a removed member at once, though their session cookie is still cached", async () => {
    const meera = await addStaff(server, agency, { username: "meera", roleKey: "operations" });
    const jar = await signedInStaff(server, agency, meera);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    await server.platform.member.update({
      where: { id: meera.memberId },
      data: { deletedAt: new Date(), deletedBy: agency.owner.userId },
    });
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({ status: 403, reason: "NOT_A_MEMBER" });
  });

  it("lets a revoked session through ordinary procedures for up to 5 minutes, but never through sensitive ones", async () => {
    const jar = await signedInOwner(server, agency);
    await server.platform.session.deleteMany({ where: { userId: agency.owner.userId } });
    // Cookie cache: the session row is gone, but the signed cookie is still trusted for up to 5 minutes (spec 6.4).
    expect((await query(server, "me.get", jar)).status).toBe(200);
    expect((await mutate(server, "settings.setTwoFactorRequirement", { required: false }, jar)).status).toBe(401);
  });

  it("holds a member with a temporary password at me.get until they change it through Better Auth", async () => {
    const tara = await addStaff(server, agency, { username: "tara", roleKey: "sales", mustChangePassword: true });
    const jar = await signedInStaff(server, agency, tara);
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).pendingStep).toBe("CHANGE_PASSWORD");

    const change = jar.absorb(
      await postJson(
        server,
        "/api/auth/change-password",
        { currentPassword: tara.password, newPassword: "taras-own-password", revokeOtherSessions: true },
        jar,
      ),
    );
    expect(change.status).toBe(200);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
  });
});
