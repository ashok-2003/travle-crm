// The request checks of spec 6.5 through the HTTP app: signed in (1), role permission (4), membership read on every
// request, fresh sessions for sensitive procedures (spec 6.4), and the steps a member must take before using the app.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  ORIGIN,
  postJson,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";
import { enableTwoFactor } from "./support/two-factor.js";

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

  it("refuses a body over 64 KB with 413, before tRPC reads it", async () => {
    const owner = await signedInOwner(server, agency);
    const input = { required: false, padding: "x".repeat(70_000) };
    const response = await mutate(server, "settings.setTwoFactorRequirement", input, owner);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ code: "PAYLOAD_TOO_LARGE", message: "Request is too large" });
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

  describe("mutations from other websites", () => {
    // An Owner with two-factor on, so a post that got through would really switch the requirement on.
    let own: TestAgency;
    let owner: CookieJar;

    beforeAll(async () => {
      own = await createTestAgency(server);
      owner = await signedInOwner(server, own);
      await enableTwoFactor(server, owner, own.owner.password);
    });

    const post = (headers: Record<string, string>, body: string | FormData) =>
      server.app.request("/api/trpc/settings.setTwoFactorRequirement", {
        method: "POST",
        headers: { cookie: owner.header, ...headers },
        body,
      });
    const requirement = () =>
      server.platform.organization.findUniqueOrThrow({
        where: { id: own.organizationId },
        select: { requireTwoFactor: true },
      });

    it("refuses a JSON post from a foreign origin, and changes nothing", async () => {
      const response = await post(
        { "content-type": "application/json", origin: "https://evil.example" },
        JSON.stringify({ required: true }),
      );
      expect(response.status).toBe(403);
      expect(await requirement()).toEqual({ requireTwoFactor: false });
    });

    it("refuses a post with no origin", async () => {
      const response = await post({ "content-type": "application/json" }, JSON.stringify({ required: true }));
      expect(response.status).toBe(403);
      expect(await requirement()).toEqual({ requireTwoFactor: false });
    });

    it("refuses a form post from the trusted origin, which would skip the browser's preflight", async () => {
      const form = new FormData();
      form.set("required", "true");
      expect((await post({ origin: ORIGIN }, form)).status).toBe(415);
      expect(await requirement()).toEqual({ requireTwoFactor: false });
    });

    it("still takes a same-origin JSON post, with a charset parameter too", async () => {
      const response = await post(
        { "content-type": "application/json; charset=utf-8", origin: ORIGIN },
        JSON.stringify({ required: true }),
      );
      expect(response.status).toBe(200);
      expect(await requirement()).toEqual({ requireTwoFactor: true });
    });
  });

  it("refuses a member whose password was reset, though their session cookie is still cached", async () => {
    const kiran = await addStaff(server, agency, { username: "kiran", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, kiran);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    const owner = await signedInOwner(server, agency);
    const reset = await mutate(
      server,
      "staff.resetPassword",
      { memberId: kiran.memberId, temporaryPassword: "kiran-new-temp-1" },
      owner,
    );
    expect(reset.status).toBe(200);
    // The pending password change is read from the database on every request, so the cached cookie doesn't help.
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
    expect((await mutate(server, "settings.setTwoFactorRequirement", { required: false }, jar)).status).toBe(401);
  });

  it("passes on the cookies Better Auth re-issues, so the session cache is refreshed", async () => {
    const owner = await signedInOwner(server, agency);
    const token = owner.header.split("; ").find((pair) => pair.startsWith("better-auth.session_token="));
    if (token === undefined) throw new Error("the owner has no session cookie");
    // A browser whose cache cookie expired still holds the session cookie: Better Auth reads the row and re-issues it.
    const withoutCache = new CookieJar();
    withoutCache.absorb(new Response(null, { headers: { "set-cookie": token } }));
    expect(withoutCache.names()).toEqual(["better-auth.session_token"]);

    const ordinary = await query(server, "me.get", withoutCache);
    expect(ordinary.headers.getSetCookie().some((cookie) => cookie.startsWith("better-auth.session_data="))).toBe(true);
    const sensitive = await mutate(server, "settings.setTwoFactorRequirement", { required: false }, withoutCache);
    expect(sensitive.headers.getSetCookie().some((cookie) => cookie.startsWith("better-auth.session_data="))).toBe(
      true,
    );
  });
});
