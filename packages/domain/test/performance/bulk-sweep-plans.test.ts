// The bulk files' sweep and erasure read their own indexes (M6, M7): among thousands of exports across agencies, the
// sweep's ready ones are found on data_export_due and the ones still making a day later on data_export_making, never
// by reading the table; and an erasure finds a removed member's import rows on import_row_member. The plans are read
// as the platform role, which runs both: its queries cross organizations, so a runtime plan under row-level security
// would be another query's.
import { randomUUID } from "node:crypto";
import { sql } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import {
  analyzeTables,
  createIsolatedDatabase,
  createTestOrganization,
  type IsolatedDatabase,
} from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { exportSweepQueries } from "../../src/exports/index.js";
import { planOf } from "./query-plans.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("the bulk files' sweep and erasure plans", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let organizationId: string;
  const member = randomUUID();

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    platformDb = createPlatformDatabase(isolated.urls.platform, { maxConnections: 1 });
    organizationId = await createTestOrganization(platform, "Bulk plans");
    const now = Date.now();
    // A year of exports: nearly all expired, some ready and a few making, the odd one stuck.
    await platform.dataExport.createMany({
      data: Array.from({ length: 20_000 }, (_, index) => {
        const status = index % 50 === 0 ? "ready" : index % 97 === 0 ? "making" : "expired";
        const createdAt = new Date(now - (index % 365) * DAY_MS);
        return {
          organizationId,
          kind: "leads",
          format: "csv",
          status,
          filter: {},
          requestedBy: randomUUID(),
          createdAt,
          ...(status === "ready" ? { readyAt: createdAt, expiresAt: new Date(createdAt.getTime() + DAY_MS) } : {}),
        };
      }),
    });
    // 20,000 import rows, a handful of them a member's (a staff import's).
    const batches = await Promise.all(
      Array.from({ length: 10 }, () =>
        platform.importBatch.create({
          data: {
            organizationId,
            kind: "staff",
            fileName: "team.csv",
            fileKind: "csv",
            startedBy: randomUUID(),
            keepUntil: new Date(now + DAY_MS),
          },
          select: { id: true },
        }),
      ),
    );
    for (const batch of batches) {
      await platform.importRow.createMany({
        data: Array.from({ length: 2000 }, (_, index) => ({
          organizationId,
          batchId: batch.id,
          rowNumber: index + 2,
          plan: "new",
          memberId: index === 0 ? member : null,
        })),
      });
    }
    await analyzeTables(isolated.urls, ["data_export", "import_row"]);
  }, 300_000);

  afterAll(async () => {
    await platformDb.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  it("finds the sweep's ready and stuck exports on their own indexes", async () => {
    const queries = exportSweepQueries(new Date(), 100, []);
    const ready = await platformDb.transaction((tx) => planOf(tx, queries.ready));
    expect(ready.indexes, ready.text).toContain("data_export_due");
    expect(ready.seqScans).not.toContain("data_export");
    const stuck = await platformDb.transaction((tx) => planOf(tx, queries.stuck));
    expect(stuck.indexes, stuck.text).toContain("data_export_making");
    expect(stuck.seqScans).not.toContain("data_export");
  });

  it("finds a removed member's import rows on import_row_member", async () => {
    const rows = await platformDb.transaction((tx) =>
      planOf(
        tx,
        sql`SELECT id FROM import_row WHERE organization_id = ${organizationId}::uuid AND member_id = ${member}::uuid`,
      ),
    );
    expect(rows.indexes, rows.text).toContain("import_row_member");
    expect(rows.seqScans).not.toContain("import_row");
  });
});
