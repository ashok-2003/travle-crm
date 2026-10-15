// The platform's purge and export of one organization (spec 5): every table with organization_id, found from the
// catalog, deleted in an order no foreign key trips over, the organization last; another organization untouched.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { Prisma } from "../src/generated/prisma/client.js";
import {
  createPlatformClient,
  createPlatformDatabase,
  deleteOrganizationRows,
  organizationRows,
  type PlatformClient,
  type PlatformDatabase,
} from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";
import { orgTableFixtures } from "./org-table-fixtures.js";

/** Every table with organization_id, Better Auth's member and invitation included. */
async function organizationTables(platform: PlatformClient): Promise<string[]> {
  const rows = await platform.$queryRaw<{ table_name: string }[]>`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name`;
  return rows.map((row) => row.table_name);
}

describe("an organization's rows", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  /** An organization with a row in every organization table: each module's isolation fixture, and a member. */
  async function populated(name: string): Promise<string> {
    const organizationId = await createTestOrganization(platform, name);
    for (const fixture of Object.values(orgTableFixtures)) await db.forOrg(organizationId, fixture.create);
    const user = await platform.user.create({ data: { name, email: `${randomUUID()}@example.test` } });
    await platform.member.create({ data: { organizationId, userId: user.id, role: "isolation-role" } });
    await platform.invitation.create({
      data: { organizationId, email: `${randomUUID()}@example.test`, inviterId: user.id, expiresAt: new Date() },
    });
    return organizationId;
  }

  const rowsOf = async (organizationId: string): Promise<Record<string, number>> => {
    const counts: Record<string, number> = {};
    for (const table of await organizationTables(platform)) {
      const [row] = await platform.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM ${Prisma.raw(`"${table}"`)} WHERE organization_id = ${organizationId}::uuid`;
      counts[table] = row?.n ?? 0;
    }
    return counts;
  };

  it("exports every row of the organization, by table, with the organization's own", async () => {
    const organizationId = await populated("Exported");
    const exported = await platformDb.transaction((tx) =>
      organizationRows(tx, organizationId, { except: ["outbox_event"] }),
    );
    expect(exported.organization).toEqual([expect.objectContaining({ id: organizationId, name: "Exported" })]);
    expect(exported.outbox_event).toBeUndefined();
    for (const table of (await organizationTables(platform)).filter((name) => name !== "outbox_event")) {
      expect(exported[table]?.length, table).toBeGreaterThan(0);
    }
  });

  it("deletes every row of the organization, audit entries first, then the organization, and no one else's", async () => {
    const purged = await populated("Purged");
    const kept = await populated("Kept");
    const keptBefore = await rowsOf(kept);
    const deleted = await platformDb.transaction((tx) => deleteOrganizationRows(tx, purged));
    expect(Object.keys(deleted)[0]).toBe("audit_entry");
    expect(deleted.organization).toBe(1);
    expect(Object.values(await rowsOf(purged)).every((count) => count === 0)).toBe(true);
    expect(await platform.organization.count({ where: { id: purged } })).toBe(0);
    expect(await rowsOf(kept)).toEqual(keptBefore);
  });

  it("can't be done by the runtime role", async () => {
    const organizationId = await createTestOrganization(platform, "Runtime");
    await expect(db.withoutOrg((tx) => deleteOrganizationRows(tx as never, organizationId))).rejects.toThrow(
      /permission denied/,
    );
  });
});
