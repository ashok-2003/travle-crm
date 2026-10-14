// db.withoutOrg() reaches tables without organization_id and sees no organization's rows, as row-level security
// fails closed when no organization is set.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { NestedForOrgError, withoutOrg, WrongDatabaseRoleError } from "../src/for-org.js";
import { createPrismaClient } from "../src/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("db.withoutOrg", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Without organization");
    await db.forOrg(organizationId, (tx) => tx.orgCounter.create({ data: { key: "WITHOUT-2026", value: 1 } }));
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("sees no organization's rows, and can't write any", async () => {
    expect(await db.withoutOrg((tx) => tx.orgCounter.count())).toBe(0);
    // Naming an organization gets past the NOT NULL check, so it is row-level security that refuses the write.
    await expect(
      db.withoutOrg((tx) => tx.orgCounter.create({ data: { organizationId, key: "NONE-2026", value: 1 } })),
    ).rejects.toThrow(/row-level security/);
  });

  it("clears an organization left on the connection by an earlier session-level setting", async () => {
    const client = createPrismaClient(urls.runtime, { max: 1 });
    try {
      await client.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, false)`;
      expect(await client.orgCounter.count()).toBe(1);
      expect(await withoutOrg(client, (tx) => tx.orgCounter.count())).toBe(0);
    } finally {
      await client.$disconnect();
    }
  });

  it("reads the organizations table, which has no row-level security", async () => {
    const found = await db.withoutOrg(
      (tx) => tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM organization WHERE id = ${organizationId}::uuid`,
    );
    expect(found[0]?.n).toBe(1);
  });

  it("can't be nested inside forOrg(), or forOrg() inside it", async () => {
    await expect(db.forOrg(organizationId, () => db.withoutOrg(() => Promise.resolve(1)))).rejects.toBeInstanceOf(
      NestedForOrgError,
    );
    await expect(db.withoutOrg(() => db.forOrg(organizationId, () => Promise.resolve(1)))).rejects.toBeInstanceOf(
      NestedForOrgError,
    );
  });

  it("refuses to run as a role that can see every organization", async () => {
    const platformClient = createPrismaClient(urls.platform, { max: 1 });
    try {
      await expect(withoutOrg(platformClient, () => Promise.resolve(1))).rejects.toBeInstanceOf(WrongDatabaseRoleError);
    } finally {
      await platformClient.$disconnect();
    }
  });
});
