// Revoking access in every state an organization can still sign in to (ADR 0021): while read-only, an Owner and an
// Admin with staff:manage may still remove staff, give a new temporary password and turn two-factor on, and nothing
// else; while suspended, the Owner alone. Security outranks billing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestServer } from "./support/test-server.js";
import { mutate, refusalOf } from "./support/trpc.js";
import { enableTwoFactor } from "./support/two-factor.js";

/** Someone who can revoke access, signed in with two-factor on, and two members to cut off. */
interface Revoker {
  jar: CookieJar;
  toRemove: TestStaff;
  toReset: TestStaff;
}

describe("revoking access whatever the subscription", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /** An agency whose Owner and Admin use two-factor, each with two members to cut off, then put in `status`. */
  async function agencyIn(status: "read_only" | "suspended") {
    const agency = await createTestAgency(server);
    const owner = await signedInOwner(server, agency);
    await enableTwoFactor(server, owner, agency.owner.password);
    const adminStaff = await addStaff(server, agency, { username: "priya", roleKey: "org-admin" });
    const admin = await signedInStaff(server, agency, adminStaff);
    await enableTwoFactor(server, admin, adminStaff.password);
    const revoker = async (jar: CookieJar, name: string): Promise<Revoker> => ({
      jar,
      toRemove: await addStaff(server, agency, { username: `${name}-leaving`, roleKey: "sales" }),
      toReset: await addStaff(server, agency, { username: `${name}-leaked`, roleKey: "sales" }),
    });
    const revokers = { owner: await revoker(owner, "o"), admin: await revoker(admin, "a") };
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status, statusChangedAt: new Date(), trialEndsOn: null },
    });
    return revokers;
  }

  /** The status and reason of each revocation, in order: remove, new password, two-factor on. */
  async function revocations({ jar, toRemove, toReset }: Revoker) {
    const answers = [
      await mutate(server, "staff.remove", { memberId: toRemove.memberId }, jar),
      await mutate(
        server,
        "staff.resetPassword",
        { memberId: toReset.memberId, temporaryPassword: "fresh-start-1" },
        jar,
      ),
      await mutate(server, "settings.setTwoFactorRequirement", { required: true }, jar),
    ];
    return Promise.all(answers.map((answer) => (answer.ok ? Promise.resolve(answer.status) : refusalOf(answer))));
  }

  /** Every other change staff management and settings offer: each one refused with `reason`. */
  async function expectOtherChangesRefused({ jar, toReset }: Revoker, reason: string) {
    const refused = { status: 403, reason };
    const newcomer = { name: "Newcomer", username: `new-${crypto.randomUUID().slice(0, 8)}`, roleKey: "sales" };
    expect(
      await refusalOf(await mutate(server, "staff.create", { ...newcomer, temporaryPassword: "newcomer-pass-1" }, jar)),
    ).toEqual(refused);
    expect(
      await refusalOf(
        await mutate(server, "staff.updateRole", { memberId: toReset.memberId, roleKey: "operations" }, jar),
      ),
    ).toEqual(refused);
    // Turning two-factor off loosens sign-in: a change like any other.
    expect(await refusalOf(await mutate(server, "settings.setTwoFactorRequirement", { required: false }, jar))).toEqual(
      refused,
    );
  }

  /** How many of these members are still in the organization. */
  const stillMembers = (...staff: TestStaff[]) =>
    server.platform.member.count({ where: { id: { in: staff.map((one) => one.memberId) }, deletedAt: null } });

  it("lets an Owner and an Admin with staff:manage revoke access while read-only, and change nothing else", async () => {
    const { owner, admin } = await agencyIn("read_only");
    expect(await revocations(owner)).toEqual([200, 200, 200]);
    expect(await revocations(admin)).toEqual([200, 200, 200]);
    expect(await stillMembers(owner.toRemove, admin.toRemove)).toBe(0);
    await expectOtherChangesRefused(owner, "ORGANIZATION_READ_ONLY");
    await expectOtherChangesRefused(admin, "ORGANIZATION_READ_ONLY");
  });

  it("lets only the Owner revoke access while suspended", async () => {
    const { owner, admin } = await agencyIn("suspended");
    const suspended = { status: 403, reason: "ORGANIZATION_SUSPENDED" };
    expect(await revocations(admin)).toEqual([suspended, suspended, suspended]);
    expect(await stillMembers(admin.toRemove)).toBe(1);
    expect(await revocations(owner)).toEqual([200, 200, 200]);
    expect(await stillMembers(owner.toRemove)).toBe(0);
    await expectOtherChangesRefused(owner, "ORGANIZATION_SUSPENDED");
  });
});
