// The imports' shared queries stay fast (spec 11, ADR 0028): an agency with a year of imports (fifty of one person, one
// of them of 10,000 rows, and its colleagues' 90,000 rows more), beside neighbouring agencies' thousands of imports,
// lists Recent imports and counts a preview within 150 ms on their indexes, and finds a 10,000-row file's earlier
// fingerprints with = ANY on import_row_fingerprint. Everything runs as app_runtime inside forOrg, so the plans are the
// runtime's under row-level security.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx, type Sql } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import {
  analyzeTables,
  createIsolatedDatabase,
  createTestOrganization,
  type IsolatedDatabase,
} from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  earlierFingerprints,
  earlierFingerprintsQuery,
  encodeRowReason,
  importCounts,
  importCountsQuery,
  recentImports,
  recentImportsQuery,
  rowFingerprint,
} from "../../src/imports/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { fastestMs, planOf, type QueryPlan } from "./query-plans.js";

const ROWS = 10_000;
const plans = ["new", "returning", "enquiry", "blocked", "already_imported", "not_added"] as const;
const reasons = ["no_contact", "no_name", "not_a_lead"] as const;

describe("imports at scale", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let importer: MemberAccess;
  let bigImport: string;
  let currentImport: string;
  /** The fingerprints the big import added, and as many no import added. */
  let fingerprints: Uint8Array[];
  const found = new Map<string, QueryPlan>();
  const timings = new Map<string, number>();

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const plan = async (name: string, query: Sql) => {
    const read = await inOrg((tx) => planOf(tx, query));
    found.set(name, read);
    return read;
  };
  const time = async (name: string, run: (tx: OrgTx) => Promise<unknown>) => {
    const ms = await fastestMs(() => inOrg(run));
    timings.set(name, ms);
    return ms;
  };

  /** An import of `rows` rows in the organization, every one added with a fingerprint of its own. */
  async function seedImport(organization: string, startedBy: string, rows: number, salt: string) {
    const batch = await platform.importBatch.create({
      data: {
        organizationId: organization,
        kind: "leads",
        status: "done",
        fileName: "enquiries.csv",
        fileKind: "csv",
        startedBy,
        rowsTotal: rows,
        rowsAdded: rows,
        finishedAt: new Date(),
        checkedAt: new Date(),
        keepUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    const added: Uint8Array[] = [];
    for (let start = 0; start < rows; start += 2000) {
      const chunk = Array.from({ length: Math.min(2000, rows - start) }, (_, index) => {
        const rowNumber = start + index + 2;
        const rowPlan = plans[rowNumber % plans.length] ?? "new";
        const fingerprint = rowFingerprint("leads", [salt, String(rowNumber)]);
        added.push(fingerprint);
        return {
          organizationId: organization,
          batchId: batch.id,
          rowNumber,
          plan: rowPlan,
          reasons:
            rowPlan === "not_added"
              ? [encodeRowReason({ code: reasons[Math.floor(rowNumber / plans.length) % reasons.length] ?? "no_name" })]
              : [],
          outcome: "added",
          fingerprint: Uint8Array.from(fingerprint),
        };
      });
      await platform.importRow.createMany({ data: chunk });
    }
    return { id: batch.id, added };
  }

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Importing agency");
    importer = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID(), memberId: randomUUID() });
    for (let index = 0; index < 49; index += 1)
      await seedImport(organizationId, importer.userId, 20, `small-${String(index)}`);
    const big = await seedImport(organizationId, importer.userId, ROWS, "big");
    bigImport = big.id;
    // Colleagues' imports over the year, and neighbouring agencies' thousands of imports made after, so the planner
    // chooses by how few rows are this person's and this agency's.
    for (let index = 0; index < 9; index += 1)
      await seedImport(organizationId, randomUUID(), ROWS, `colleague-${String(index)}`);
    const neighbour = await createTestOrganization(platform, "Neighbouring agency");
    await seedImport(neighbour, randomUUID(), ROWS, "neighbour");
    await platform.importBatch.createMany({
      data: Array.from({ length: 3000 }, () => ({
        organizationId: neighbour,
        kind: "leads",
        status: "done",
        fileName: "enquiries.csv",
        fileKind: "csv",
        startedBy: randomUUID(),
        keepUntil: new Date(),
      })),
    });
    // The agency's staff imports beside its lead imports.
    await platform.importBatch.createMany({
      data: Array.from({ length: 30 }, () => ({
        organizationId,
        kind: "staff",
        status: "done",
        fileName: "team.csv",
        fileKind: "csv",
        startedBy: randomUUID(),
        keepUntil: new Date(),
      })),
    });
    currentImport = (await seedImport(organizationId, importer.userId, 0, "current")).id;
    // A 10,000-row file, half of it added by the big import before.
    fingerprints = [
      ...big.added.slice(0, ROWS / 2),
      ...Array.from({ length: ROWS / 2 }, (_, index) => rowFingerprint("leads", ["new", String(index)])),
    ];
    await analyzeTables(isolated.urls, ["import_batch", "import_row"]);
  }, 300_000);

  afterAll(async () => {
    const indexes = Object.fromEntries([...found].map(([name, read]) => [name, read.indexes]));
    const fastest = Object.fromEntries([...timings].map(([name, ms]) => [name, Math.round(ms * 10) / 10]));
    console.info("Imports at scale:", JSON.stringify({ fastest, indexes }));
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  it("lists Recent imports within 150 ms, on import_batch_recent", async () => {
    expect((await plan("recent", recentImportsQuery("leads", importer.userId))).indexes).toContain(
      "import_batch_recent",
    );
    const recent = await inOrg((tx) => recentImports(tx, importer, "leads"));
    expect(recent).toHaveLength(10);
    expect(recent[0]?.id).toBe(currentImport);
    expect(await time("recent", (tx) => recentImports(tx, importer, "leads"))).toBeLessThan(150);
  });

  it("counts a 10,000-row preview by plan and reason within 150 ms, on import_row_by_plan", async () => {
    expect((await plan("counts", importCountsQuery(bigImport))).indexes).toContain("import_row_by_plan");
    const counts = await inOrg((tx) => importCounts(tx, { id: bigImport, rowsNewStage: 0 }));
    expect(Object.values(counts.byPlan).reduce((sum, rows) => sum + rows, 0)).toBe(ROWS);
    expect(counts.notAdded.map((group) => group.reason).sort()).toEqual([...reasons].sort());
    expect(await time("counts", (tx) => importCounts(tx, { id: bigImport, rowsNewStage: 0 }))).toBeLessThan(150);
  });

  it("finds 10,000 earlier fingerprints with = ANY on import_row_fingerprint", async () => {
    const read = await plan("fingerprints", earlierFingerprintsQuery("leads", fingerprints, currentImport));
    expect(read.indexes).toContain("import_row_fingerprint");
    expect(read.seqScans).not.toContain("import_row");
    const earlier = await inOrg((tx) => earlierFingerprints(tx, "leads", fingerprints, currentImport));
    expect(earlier.size).toBe(ROWS / 2);
    await time("fingerprints", (tx) => earlierFingerprints(tx, "leads", fingerprints, currentImport));
  });
});
