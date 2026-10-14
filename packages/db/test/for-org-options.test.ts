// forOrg() limits: a transaction past its timeout is rolled back, and a forOrg() inside another is refused rather than
// left to run on a second connection that can't see the first one's writes.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { NestedForOrgError } from "../src/for-org.js";
import { createIdentityDatabase, type IdentityDatabase } from "../src/identity.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe("forOrg options and nesting", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let identityDatabase: IdentityDatabase;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    identityDatabase = createIdentityDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "forOrg options");
  });

  afterAll(async () => {
    await identityDatabase.disconnect();
    await db.disconnect();
    await platform.$disconnect();
  });

  it("rolls back a transaction that runs past its timeout", async () => {
    await expect(
      db.forOrg(
        organizationId,
        async (tx) => {
          await tx.orgCounter.create({ data: { key: "SLOW-2026", value: 1 } });
          await pause(400);
        },
        { timeout: 100 },
      ),
    ).rejects.toThrow(/timeout|expired|closed/i);
    expect(await db.forOrg(organizationId, (tx) => tx.orgCounter.count({ where: { key: "SLOW-2026" } }))).toBe(0);
  });

  it("refuses a forOrg() inside another, from the same or another database handle", async () => {
    await expect(
      db.forOrg(organizationId, () => db.forOrg(organizationId, (tx) => tx.role.count())),
    ).rejects.toBeInstanceOf(NestedForOrgError);
    await expect(
      identityDatabase.forOrg(organizationId, () => db.forOrg(organizationId, (tx) => tx.role.count())),
    ).rejects.toBeInstanceOf(NestedForOrgError);
  });

  it("allows one forOrg() after another, and many side by side", async () => {
    expect(await db.forOrg(organizationId, (tx) => tx.role.count())).toBe(0);
    expect(await db.forOrg(organizationId, (tx) => tx.role.count())).toBe(0);
    const counts = await Promise.all(
      Array.from({ length: 6 }, () => db.forOrg(organizationId, (tx) => tx.role.count())),
    );
    expect(counts).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
