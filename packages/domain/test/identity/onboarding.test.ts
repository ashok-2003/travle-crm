// Onboarding's identity steps (spec 7.1), as the platform console runs them in one platform transaction: the
// organization's row as the platform role, then, stepped into the new organization, its starter roles and its first
// Owner, invited by email with no password yet.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { asOrganization, createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it, onTestFinished, vi } from "vitest";
import {
  createOrganizationRecord,
  insertStarterRoles,
  inviteOwner,
  OWNER_ROLE_KEY,
  requestInvite,
} from "../../src/identity/index.js";
import { platformActor } from "../../src/kernel/index.js";
import { createTestIdentity, type TestIdentity } from "./test-identity.js";

const adminUserId = "0199e7a0-0000-7000-8000-00000000ad11";
const uniqueCode = () => `O${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;

describe("onboarding's identity steps", () => {
  let platformDb: PlatformDatabase;
  let db: Database;
  let test: TestIdentity;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    test = createTestIdentity();
  });

  afterAll(async () => {
    await test.close();
    await db.disconnect();
    await platformDb.disconnect();
  });

  /** The console's onboarding transaction, reduced to identity's steps. */
  function onboard(code: string, ownerEmail: string) {
    return platformDb.transaction(async (tx) => {
      const organization = await createOrganizationRecord(tx, {
        name: "Sharma Holidays",
        code,
        timeZone: "Asia/Kolkata",
        contactEmail: "hello@sharma.example",
      });
      const owner = await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        return inviteOwner(orgTx, platformActor(organization.id, adminUserId), {
          name: "Asha Sharma",
          email: ownerEmail,
        });
      });
      return { organizationId: organization.id, owner };
    });
  }

  it("creates the organization, its roles, and an Owner invited by email with no password yet", async () => {
    const code = uniqueCode();
    const email = `asha-${code.toLowerCase()}@example.test`;
    const { organizationId, owner } = await onboard(code, email);
    expect(await db.forOrg(organizationId, (tx) => tx.role.count())).toBe(5);
    const user = await test.database.client.user.findUniqueOrThrow({
      where: { id: owner.userId },
      include: { accounts: true, member: true },
    });
    expect(user).toMatchObject({ email, mustChangePassword: false, member: { role: OWNER_ROLE_KEY, organizationId } });
    expect(user.accounts).toEqual([]);
    const entries = await db.forOrg(organizationId, (tx) => tx.auditEntry.findMany({ orderBy: { id: "asc" } }));
    expect(entries.map((entry) => [entry.action, entry.source, entry.actorUserId])).toEqual([
      ["staff.created", "platform", adminUserId],
      ["staff.invited", "platform", adminUserId],
    ]);
    const events = await db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "staff.invited" } }),
    );
    expect(events.map((event) => event.payload)).toEqual([{ memberId: owner.memberId, userId: owner.userId }]);
    // No password until they choose one from the invite. Better Auth warns that it found no password account.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    const signIn = await test.identity.auth.api.signInEmail({
      body: { email, password: "any-password-1" },
      asResponse: true,
    });
    expect(signIn.status).toBe(401);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("User not found"));
  });

  it("refuses an organization code another organization has, and leaves nothing of the attempt", async () => {
    const code = uniqueCode();
    await onboard(code, `first-${code.toLowerCase()}@example.test`);
    const second = `second-${code.toLowerCase()}@example.test`;
    await expect(onboard(code, second)).rejects.toMatchObject({ reason: "ORGANIZATION_CODE_TAKEN" });
    expect(await test.database.client.user.count({ where: { email: second } })).toBe(0);
  });

  it("rolls the whole onboarding back when a later step fails", async () => {
    const taken = `taken-${randomUUID()}@example.test`;
    await onboard(uniqueCode(), taken);
    const code = uniqueCode();
    await expect(onboard(code, taken)).rejects.toMatchObject({ reason: "EMAIL_OR_USERNAME_TAKEN" });
    expect(await test.database.client.organization.count({ where: { code } })).toBe(0);
  });

  it("can't create an organization as the runtime role, whatever the code does", async () => {
    const { organizationId } = await onboard(uniqueCode(), `runtime-${randomUUID()}@example.test`);
    await expect(
      test.database.forOrg(organizationId, (tx) =>
        createOrganizationRecord(tx, {
          name: "Sneaky",
          code: uniqueCode(),
          timeZone: "Asia/Kolkata",
          contactEmail: null,
        }),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("asks for another invite only for the organization's own members with a real address", async () => {
    const { organizationId, owner } = await onboard(uniqueCode(), `again-${randomUUID()}@example.test`);
    const actor = platformActor(organizationId, adminUserId);
    await platformDb.transaction((tx) =>
      asOrganization(tx, organizationId, (orgTx) => requestInvite(orgTx, actor, owner.memberId)),
    );
    expect(await db.forOrg(organizationId, (tx) => tx.outboxEvent.count({ where: { type: "staff.invited" } }))).toBe(2);
    const other = await onboard(uniqueCode(), `other-${randomUUID()}@example.test`);
    await expect(
      platformDb.transaction((tx) =>
        asOrganization(tx, organizationId, (orgTx) => requestInvite(orgTx, actor, other.owner.memberId)),
      ),
    ).rejects.toMatchObject({ reason: "MEMBER_NOT_FOUND" });
  });
});
