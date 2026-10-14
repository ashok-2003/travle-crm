// Two-factor sign-in (spec 6.2): optional per person, required for everyone when an owner says so, with the setup
// endpoints left open to those who still need them, and no placeholder email shown in the authenticator app.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInWithCode,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";
import { codeFor, enableTwoFactor } from "./support/two-factor.js";

describe("two-factor sign-in", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("can't be required by an owner who doesn't use it, so they can't lock themselves out", async () => {
    const owner = await signedInOwner(server, agency);
    expect(
      await refusalOf(await mutate(server, "settings.setTwoFactorRequirement", { required: true }, owner)),
    ).toEqual({
      status: 403,
      reason: "ENABLE_TWO_FACTOR_FIRST",
    });
  });

  it("once required, holds members without it at setup, which stays open to them", async () => {
    const owner = await signedInOwner(server, agency);
    await enableTwoFactor(server, owner, agency.owner.password);
    expect(await dataOf(await mutate(server, "settings.setTwoFactorRequirement", { required: true }, owner))).toEqual({
      requireTwoFactor: true,
    });

    const ravi = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, ravi);
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({
      status: 403,
      reason: "SET_UP_TWO_FACTOR",
    });
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).pendingStep).toBe("SET_UP_TWO_FACTOR");

    const setup = await enableTwoFactor(server, jar, ravi.password);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    // The phone app shows the organization code and username, never the placeholder address.
    expect(decodeURIComponent(setup.totpUri)).toContain(`:${agency.code} ravi?`);
    expect(setup.totpUri).not.toContain("no-email.invalid");
  });

  it("changes only the caller's own organization, and refuses input that names another", async () => {
    // The organization table has no row-level security, so the update is scoped to the session's organization only.
    const caller = await createTestAgency(server);
    const other = await createTestAgency(server);
    const owner = await signedInOwner(server, caller);
    await enableTwoFactor(server, owner, caller.owner.password);
    const requirement = (organizationId: string) =>
      server.platform.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { requireTwoFactor: true },
      });
    // Inputs are strict, so naming an organization is refused before anything changes.
    const naming = await mutate(
      server,
      "settings.setTwoFactorRequirement",
      { required: true, organizationId: other.organizationId },
      owner,
    );
    expect(await refusalOf(naming)).toEqual({ status: 400, reason: null });
    expect(await requirement(caller.organizationId)).toEqual({ requireTwoFactor: false });
    const response = await mutate(server, "settings.setTwoFactorRequirement", { required: true }, owner);
    expect(await dataOf(response)).toEqual({ requireTwoFactor: true });
    expect(await requirement(caller.organizationId)).toEqual({ requireTwoFactor: true });
    expect(await requirement(other.organizationId)).toEqual({ requireTwoFactor: false });
  });

  it("asks for a code after the password, including at organization-code sign-in", async () => {
    const meera = await addStaff(server, agency, { username: "meera", roleKey: "operations" });
    const { secret } = await enableTwoFactor(server, await signedInStaff(server, agency, meera), meera.password);

    const jar = new CookieJar();
    const passwordStep = await signInWithCode(server, jar, {
      orgCode: agency.code,
      username: "meera",
      password: meera.password,
    });
    expect(await passwordStep.json()).toMatchObject({ twoFactorRedirect: true });
    expect(jar.names()).toEqual(["better-auth.two_factor"]);
    expect((await query(server, "me.get", jar)).status).toBe(401);

    jar.absorb(await postJson(server, "/api/auth/two-factor/verify-totp", { code: "000000" }, jar));
    expect((await query(server, "me.get", jar)).status).toBe(401);
    const codeStep = jar.absorb(
      await postJson(server, "/api/auth/two-factor/verify-totp", { code: await codeFor(server, secret) }, jar),
    );
    expect(codeStep.status).toBe(200);
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).user.id).toBe(meera.userId);
  });
});
