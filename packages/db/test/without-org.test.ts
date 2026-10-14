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
    await expect(db.withoutOrg((tx) => tx.orgCounter.create({ data: { key: "NONE-2026", value: 1 } }))).rejects.toThrow(
      /null value in column "organization_id"|row-level security/,
    );
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
