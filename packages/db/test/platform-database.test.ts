// The platform console's database handle: transactions as app_platform see every organization, and inside one the
// console can step into a single organization as app_runtime, where row-level security and the runtime role's grants
// apply exactly as in db.forOrg().
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { NestedForOrgError, UnscopedModelError } from "../src/errors.js";
import { InvalidOrganizationIdError } from "../src/for-org.js";
import {
  asOrganization,
  createPlatformClient,
  createPlatformDatabase,
  WrongPlatformRoleError,
  type PlatformClient,
  type PlatformDatabase,
  type PlatformTx,
} from "../src/platform.js";
import { webhookEvents } from "../src/webhooks.js";
import { createTestOrganization } from "./helpers.js";

/** Who the transaction runs as, and the organization it has set ("" for none, null if never set on the connection). */
async function sessionOf(tx: PlatformTx): Promise<{ role: string; organization: string | null } | undefined> {
  const [row] = await tx.$queryRaw<{ role: string; organization: string | null }[]>`
    SELECT current_user AS role, current_setting('app.org_id', true) AS organization`;
  return row;
}

describe("the platform database", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationA: string;
  let organizationB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationA = await createTestOrganization(platform, "Platform A");
    organizationB = await createTestOrganization(platform, "Platform B");
    for (const organizationId of [organizationA, organizationB]) {
      await db.forOrg(organizationId, (tx) => tx.orgCounter.create({ data: { key: "PLATFORM-2026", value: 1 } }));
    }
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("sees every organization's rows in a transaction", async () => {
    const keys = await platformDb.transaction((tx) =>
      tx.orgCounter.findMany({
        where: { organizationId: { in: [organizationA, organizationB] }, key: "PLATFORM-2026" },
        select: { organizationId: true },
      }),
    );
    expect(keys.map((row) => row.organizationId).sort()).toEqual([organizationA, organizationB].sort());
  });

  it("refuses a connection that isn't the platform role", async () => {
    const runtimeAsPlatform = createPlatformDatabase(urls.runtime, { maxConnections: 1 });
    try {
      await expect(runtimeAsPlatform.transaction((tx) => tx.orgCounter.count())).rejects.toBeInstanceOf(
        WrongPlatformRoleError,
      );
    } finally {
      await runtimeAsPlatform.disconnect();
    }
  });

  it("steps into one organization as the runtime role, then returns to the platform role", async () => {
    const seen = await platformDb.transaction(async (tx) => {
      const inside = await asOrganization(tx, organizationA, async (orgTx) => {
        // organization_id is filled from the organization stepped into, as inside db.forOrg().
        await orgTx.orgCounter.create({ data: { key: "STEPPED-2026", value: 1 } });
        const [row] = await orgTx.$queryRaw<{ role: string }[]>`SELECT current_user AS role`;
        return { role: row?.role, organizations: await orgTx.orgCounter.groupBy({ by: ["organizationId"] }) };
      });
      return { inside, after: await sessionOf(tx), everyone: await tx.orgCounter.count() };
    });
    expect(seen.inside.role).toBe("app_runtime");
    expect(seen.inside.organizations).toEqual([{ organizationId: organizationA }]);
    // No organization left set: a platform insert that names none must not land in the one stepped into.
    expect(seen.after).toEqual({ role: "app_platform", organization: "" });
    expect(seen.everyone).toBeGreaterThanOrEqual(3);
    expect(await db.forOrg(organizationA, (tx) => tx.orgCounter.count({ where: { key: "STEPPED-2026" } }))).toBe(1);
  });

  it("has only the runtime role's rights inside an organization", async () => {
    // app_runtime may not change audit entries; app_platform may redact their snapshots.
    await expect(
      platformDb.transaction((tx) =>
        asOrganization(tx, organizationA, (orgTx) => orgTx.$executeRaw`UPDATE audit_entry SET before = NULL`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      platformDb.transaction((tx) => tx.$executeRaw`UPDATE audit_entry SET before = NULL WHERE false`),
    ).resolves.toBe(0);
  });

  it("returns to the platform role when the work inside fails, so the transaction can go on", async () => {
    const after = await platformDb.transaction(async (tx) => {
      await expect(
        asOrganization(tx, organizationB, () => Promise.reject(new Error("refused by a business rule"))),
      ).rejects.toThrow("refused by a business rule");
      return sessionOf(tx);
    });
    expect(after).toEqual({ role: "app_platform", organization: "" });
  });

  it("starts with no organization set, whatever its pooled connection held before", async () => {
    // A new connection has never set app.org_id, so only the transaction's own reset makes it "" rather than null.
    const fresh = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    try {
      expect(await fresh.transaction(sessionOf)).toEqual({ role: "app_platform", organization: "" });
    } finally {
      await fresh.disconnect();
    }
  });

  it("refuses a write inside a step that names another organization, and changes nothing there", async () => {
    await expect(
      platformDb.transaction((tx) =>
        asOrganization(tx, organizationA, (orgTx) =>
          orgTx.orgCounter.create({ data: { organizationId: organizationB, key: "CROSS-2026", value: 1 } }),
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const changed = await platformDb.transaction((tx) =>
      asOrganization(tx, organizationA, (orgTx) =>
        orgTx.orgCounter.updateMany({ where: { organizationId: organizationB }, data: { value: 99 } }),
      ),
    );
    expect(changed.count).toBe(0);
    expect(await platform.orgCounter.findMany({ where: { organizationId: organizationB } })).toEqual([
      { organizationId: organizationB, key: "PLATFORM-2026", value: 1 },
    ]);
  });

  it("can't be nested: no forOrg(), second organization or second platform transaction inside", async () => {
    await expect(
      platformDb.transaction(() => db.forOrg(organizationA, () => Promise.resolve(1))),
    ).rejects.toBeInstanceOf(NestedForOrgError);
    await expect(
      platformDb.transaction((tx) =>
        asOrganization(tx, organizationA, () => asOrganization(tx, organizationB, () => Promise.resolve(1))),
      ),
    ).rejects.toBeInstanceOf(NestedForOrgError);
    await expect(platformDb.transaction(() => platformDb.transaction(() => Promise.resolve(1)))).rejects.toBeInstanceOf(
      NestedForOrgError,
    );
  });

  it("refuses an organization id that isn't a UUID before any SQL runs", async () => {
    await expect(
      platformDb.transaction((tx) => asOrganization(tx, "not-a-uuid", () => Promise.resolve(1))),
    ).rejects.toBeInstanceOf(InvalidOrganizationIdError);
  });

  it("reaches the tables without organization_id, but not from inside an organization", async () => {
    await expect(platformDb.transaction((tx) => webhookEvents(tx).count())).resolves.toBeGreaterThanOrEqual(0);
    await expect(
      platformDb.transaction((tx) => asOrganization(tx, organizationA, async (orgTx) => webhookEvents(orgTx).count())),
    ).rejects.toBeInstanceOf(UnscopedModelError);
  });
});
