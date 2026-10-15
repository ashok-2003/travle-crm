// Seats (spec 7.2): an organization adds staff only while its plan has a seat for them, removed members free theirs,
// two people added at once can't both take the last one, and adding someone never deadlocks with an edit of their
// role. The races hold a lock on a second connection and wait until the additions are stuck behind it.
import { createIdentityDatabase, type IdentityDatabase } from "@travel-crm/db/identity";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createIdentity, type Identity, type MemberAccess } from "../../src/identity/index.js";
import { backendPid, waitUntilBlockedBy } from "../lock-waits.js";
import { createTestAgency, memberAccessOf, testAuthSettings, type TestAgency } from "./test-identity.js";

describe("seats", () => {
  let platform: PlatformClient;
  let identity: Identity;
  /** Reads pg_stat_activity as the runtime role, which sees the identity module's statements. */
  let watcher: IdentityDatabase;
  let agency: TestAgency;
  let owner: MemberAccess;
  const seatsByOrganization = new Map<string, number>();

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    identity = createIdentity({
      databaseUrl: urls.runtime,
      maxConnections: 4,
      auth: testAuthSettings,
      seatLimit: (organizationId) => Promise.resolve(seatsByOrganization.get(organizationId) ?? null),
    });
    watcher = createIdentityDatabase(urls.runtime, { maxConnections: 1 });
    agency = await createTestAgency(identity, platform);
    owner = await memberAccessOf(identity, agency.ownerUserId, agency.organizationId);
  });

  afterAll(async () => {
    await watcher.disconnect();
    await identity.disconnect();
    await platform.$disconnect();
  });

  const addAs = (actor: MemberAccess, username: string, roleKey = "sales") =>
    identity.staff.create(actor, { name: username, username, roleKey, temporaryPassword: "temporary-pass-1" });
  const add = (username: string) => addAs(owner, username);

  /** Another organization with its Owner and `seats` seats. */
  async function agencyWithSeats(seats: number) {
    const other = await createTestAgency(identity, platform);
    seatsByOrganization.set(other.organizationId, seats);
    return { ...other, owner: await memberAccessOf(identity, other.ownerUserId, other.organizationId) };
  }

  it("refuses a member past the plan's seats, and lets a removal free one", async () => {
    // The Owner has one seat; two more.
    seatsByOrganization.set(agency.organizationId, 3);
    await add("anil");
    const bina = await add("bina");
    await expect(add("chetan")).rejects.toMatchObject({ code: "LIMIT_REACHED", reason: "SEAT_LIMIT_REACHED" });
    await identity.staff.remove(owner, { memberId: bina.memberId });
    await expect(add("chetan")).resolves.toMatchObject({ username: "chetan" });
  });

  it("gives the last seat to one of two people added at once", async () => {
    const other = await agencyWithSeats(2);
    let additions: Promise<PromiseSettledResult<unknown>[]> = Promise.resolve([]);
    await platform.$transaction(async (tx) => {
      const holder = await backendPid(tx);
      // Holding the role stops each addition after it has counted the seats, so both are inside their transactions at
      // once. Without the seat lock both would count one member, and both would be added.
      await tx.$queryRaw`
        SELECT id FROM "role" WHERE organization_id = ${other.organizationId}::uuid AND key = 'sales' FOR UPDATE`;
      additions = Promise.allSettled([addAs(other.owner, "dev"), addAs(other.owner, "esha")]);
      // One waits for the role; the other waits for the first one's hold on the seats.
      await waitUntilBlockedBy(watcher.client, holder, { count: 2 });
    });
    const results = await additions;
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "LIMIT_REACHED", reason: "SEAT_LIMIT_REACHED" },
    });
    expect(await platform.member.count({ where: { organizationId: other.organizationId, deletedAt: null } })).toBe(2);
  });

  it("adds someone while their role's permissions change, and both changes commit", async () => {
    const other = await agencyWithSeats(10);
    const role = await identity.roles.create(other.owner, {
      name: "Front desk",
      permissions: [{ permission: "leads:view", scope: "own" }],
    });
    let edit: Promise<unknown> = Promise.resolve();
    let addition: Promise<unknown> = Promise.resolve();
    await platform.$transaction(async (tx) => {
      const holder = await backendPid(tx);
      // Holding the role's permission rows stops the edit once it holds the role, before it writes new permissions.
      await tx.$queryRaw`
        SELECT rp.permission FROM role_permission rp JOIN "role" r ON r.id = rp.role_id
        WHERE r.organization_id = ${other.organizationId}::uuid AND r.key = ${role.key} FOR UPDATE OF rp`;
      edit = identity.roles.update(other.owner, {
        key: role.key,
        permissions: [{ permission: "leads:view", scope: "all" }],
      });
      edit.catch(() => undefined);
      await waitUntilBlockedBy(watcher.client, holder, { statement: 'DELETE FROM "public"."role_permission"' });
      // The addition holds the seats, then waits for the role the edit holds.
      addition = addAs(other.owner, "farid", role.key);
      addition.catch(() => undefined);
      await waitUntilBlockedBy(watcher.client, holder, { statement: 'SELECT id FROM "role" WHERE key = ' });
    });
    // Released, the edit inserts permission rows, whose key checks take a share of the organization's row. The seats'
    // hold must not refuse that share, or the two wait for each other and Postgres aborts one (40P01).
    await expect(edit).resolves.toMatchObject({ permissions: [{ permission: "leads:view", scope: "all" }] });
    await expect(addition).resolves.toMatchObject({ username: "farid", role: { key: role.key } });
  });

  it("has no limit when the plan gives none", async () => {
    seatsByOrganization.delete(agency.organizationId);
    await expect(add("farah")).resolves.toMatchObject({ username: "farah" });
  });
});
