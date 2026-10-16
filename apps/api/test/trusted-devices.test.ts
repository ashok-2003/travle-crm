// "Don't ask again on this device for 30 days" (Better Auth's trusted device) is for an organization's members only
// (ADR 0025): platform staff type their code at every sign-in, whatever they ticked, and a device trusted before they
// became platform staff lapses at their next sign-in. The api ignores the request rather than refusing it, as the
// challenge screen can't know who is signing in.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signedInPlatformStaff } from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, postJson, signInByEmail, type TestServer } from "./support/test-server.js";
import { query } from "./support/trpc.js";
import { codeFor, enableTwoFactor } from "./support/two-factor.js";

// Two-factor is off in the product (@travel-crm/contracts/features): these tests prove what turning it on brings.
vi.mock("@travel-crm/contracts/features", () => ({ features: { twoFactor: true } }));

const TRUST_COOKIE = "better-auth.trust_device";

describe("trusted devices", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /** The password step on this browser: true when Better Auth asks for the code next. */
  async function asksForCode(jar: CookieJar, email: string, password: string): Promise<boolean> {
    const response = await signInByEmail(server, jar, email, password);
    expect(response.status).toBe(200);
    return ((await response.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect === true;
  }

  /** The code step, ticking "trust this device". */
  async function verifyTrustingDevice(jar: CookieJar, secret: string): Promise<void> {
    const body = { code: await codeFor(server, secret), trustDevice: true };
    expect(jar.absorb(await postJson(server, "/api/auth/two-factor/verify-totp", body, jar)).status).toBe(200);
  }

  const trustRowsOf = (userId: string) =>
    server.platform.verification.count({ where: { value: userId, identifier: { startsWith: "trust-device-" } } });

  it("never trusts a device for platform staff, so their next sign-in asks for the code again", async () => {
    for (const level of ["support", "super-admin"] as const) {
      const staff = await signedInPlatformStaff(server, level);
      const jar = new CookieJar();
      expect(await asksForCode(jar, staff.email, staff.password)).toBe(true);
      await verifyTrustingDevice(jar, staff.secret ?? "");
      // Signed in, but nothing remembers the browser.
      expect((await query(server, "me.get", jar)).status).toBe(200);
      expect(jar.names()).not.toContain(TRUST_COOKIE);
      expect(await trustRowsOf(staff.userId)).toBe(0);
      expect(await asksForCode(jar, staff.email, staff.password), level).toBe(true);
    }
  });

  it("never trusts a device for platform staff who sign in with a backup code either", async () => {
    const staff = await signedInPlatformStaff(server, "support", { twoFactor: false });
    const { backupCodes } = await enableTwoFactor(server, staff.jar, staff.password);
    const jar = new CookieJar();
    expect(await asksForCode(jar, staff.email, staff.password)).toBe(true);
    const body = { code: backupCodes[0] ?? "", trustDevice: true };
    expect(jar.absorb(await postJson(server, "/api/auth/two-factor/verify-backup-code", body, jar)).status).toBe(200);
    expect((await query(server, "me.get", jar)).status).toBe(200);
    expect(jar.names()).not.toContain(TRUST_COOKIE);
    expect(await trustRowsOf(staff.userId)).toBe(0);
    expect(await asksForCode(jar, staff.email, staff.password)).toBe(true);
  });

  it("still lets an organization's member skip the code on a trusted device", async () => {
    const agency = await createTestAgency(server);
    const { secret } = await enableTwoFactor(server, await signedInOwner(server, agency), agency.owner.password);
    const jar = new CookieJar();
    expect(await asksForCode(jar, agency.owner.email, agency.owner.password)).toBe(true);
    await verifyTrustingDevice(jar, secret);
    expect(jar.names()).toContain(TRUST_COOKIE);
    expect(await asksForCode(jar, agency.owner.email, agency.owner.password)).toBe(false);
    expect((await query(server, "me.get", jar)).status).toBe(200);
  });

  it("forgets a device trusted before the person became platform staff, at their next sign-in", async () => {
    // Someone with no organization and no platform role yet, who trusts this browser.
    const email = `newcomer-${crypto.randomUUID()}@platform.test`;
    const password = "newcomer-password-1";
    const hash = await (await server.identity.auth.$context).password.hash(password);
    const user = await server.platform.user.create({ data: { name: "Newcomer", email } });
    await server.platform.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
    });
    const setup = new CookieJar();
    await signInByEmail(server, setup, email, password);
    const { secret } = await enableTwoFactor(server, setup, password);
    const jar = new CookieJar();
    expect(await asksForCode(jar, email, password)).toBe(true);
    await verifyTrustingDevice(jar, secret);
    expect(await asksForCode(jar, email, password)).toBe(false);

    await server.platform.user.update({ where: { id: user.id }, data: { role: "admin" } });
    expect(await asksForCode(jar, email, password)).toBe(true);
    expect(jar.names()).not.toContain(TRUST_COOKIE);
    expect(await trustRowsOf(user.id)).toBe(0);
  });
});
