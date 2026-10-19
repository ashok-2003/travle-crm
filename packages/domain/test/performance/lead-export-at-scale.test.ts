// The lead export at scale (spec 11, ADR 0028): an agency of 50,000 open leads, beside a neighbouring agency's, exports
// them all within 60 seconds with the worker's memory growing less than 150 MB, as Excel and as CSV, by keyset pages of
// 1,000 on the list's own partial indexes, never OFFSET and never a whole table. The real spreadsheets adapter writes
// the file; everything else runs as the worker does, as app_runtime inside forOrg, so the plans are the runtime's under
// row-level security.
import { randomUUID } from "node:crypto";
import { openLeadStages } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import {
  analyzeTables,
  createIsolatedDatabase,
  createTestOrganization,
  type IsolatedDatabase,
} from "@travel-crm/db/testing";
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { makeLeadExportListener } from "../../src/crm/index.js";
import { leadExportRowsQuery, leadListQuery } from "../../src/crm/lead-list-query.js";
import { exportDetail, startExport, type ExportJobDependencies } from "../../src/exports/index.js";
import { createFiles } from "../../src/files/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { fakeExportIdentity, requested } from "../exports/test-exports.js";
import { seedLargeAgency } from "./large-agency.js";
import { planOf } from "./query-plans.js";

const LEADS = 50_000;
const MB = 1024 * 1024;

describe("the lead export at scale", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let ownerUserIds: string[];
  let dependencies: ExportJobDependencies;
  const storage = createMemoryStorage();
  const sizes = new Map<string, number>();

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  /** Makes the export the way the worker does, sampling the resident memory while it runs. */
  async function exported(format: "xlsx" | "csv") {
    const { exportId } = await inOrg((tx) =>
      startExport(tx, manager, "leads", { format, filter: { view: "everyone", stage: "open" } }, new Date()),
    );
    const baseline = process.memoryUsage().rss;
    let peak = baseline;
    const sampler = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 50);
    const started = performance.now();
    try {
      await makeLeadExportListener(dependencies).handle(requested(organizationId, exportId), {
        actor: systemActor(organizationId),
        forOrg: (fn) => db.forOrg(organizationId, fn),
      });
    } finally {
      clearInterval(sampler);
    }
    const seconds = (performance.now() - started) / 1000;
    const detail = await inOrg((tx) => exportDetail(tx, manager, "leads", exportId));
    sizes.set(format, detail.file?.sizeBytes ?? 0);
    return { detail, seconds, growth: (peak - baseline) / MB };
  }

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Exporting agency");
    ({ ownerUserIds } = await seedLargeAgency(platform, isolated.urls, organizationId, {
      leads: LEADS,
      tasks: 100_000,
      staff: 500,
      destinations: 300,
    }));
    // Agencies share the tables: one seeded after this one, so its rows are newer than all of this agency's.
    const neighbour = await createTestOrganization(platform, "Neighbouring agency");
    await seedLargeAgency(platform, isolated.urls, neighbour, {
      leads: LEADS,
      tasks: 0,
      staff: 500,
      destinations: 300,
    });
    // The most one list can hold is one stage or all the open ones: make every lead of this agency open.
    await platform.$executeRaw`UPDATE lead SET stage = 'contacted' WHERE organization_id = ${organizationId}::uuid`;
    await analyzeTables(isolated.urls, ["lead"]);
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    const names = ownerUserIds.map((userId, index) => ({ userId, name: `Owner ${String(index + 1)}`, email: null }));
    dependencies = {
      files: createFiles({ db, storage }),
      spreadsheets: createSpreadsheets(),
      identity: {
        ...fakeExportIdentity(manager),
        memberContacts: (_organizationId, userIds) =>
          Promise.resolve(names.filter((name) => userIds.includes(name.userId))),
      },
      appUrl: "https://app.example.in",
    };
  }, 300_000);

  afterAll(async () => {
    console.info(
      "Lead export sizes (MB):",
      JSON.stringify(Object.fromEntries([...sizes].map(([k, v]) => [k, v / MB]))),
    );
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  it("exports 50,000 leads within 60 s, the resident memory growing less than 150 MB", async () => {
    const { detail, seconds, growth } = await exported("xlsx");
    expect(detail).toMatchObject({ status: "ready", rowsTotal: LEADS, rowsDone: LEADS });
    console.info(
      "Lead export:",
      JSON.stringify({ seconds: Math.round(seconds * 10) / 10, growthMb: Math.round(growth) }),
    );
    expect(seconds).toBeLessThan(60);
    expect(growth).toBeLessThan(150);
  }, 120_000);

  it("reads each page by keyset on lead_open or lead_open_by_owner, never OFFSET, never a whole table", async () => {
    const [anyLead] = await inOrg((tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM lead ORDER BY id DESC LIMIT 1`);
    const before = anyLead?.id;
    const everyone = leadListQuery({
      ownerUserId: null,
      stages: openLeadStages,
      ...(before && { before }),
      limit: 1001,
    });
    const mine = leadListQuery({
      ownerUserId: ownerUserIds[0] ?? "",
      stages: openLeadStages,
      ...(before && { before }),
      limit: 1001,
    });
    expect((await inOrg((tx) => planOf(tx, everyone))).indexes).toContain("lead_open");
    expect((await inOrg((tx) => planOf(tx, mine))).indexes).toContain("lead_open_by_owner");
    const ids = await inOrg((tx) => tx.$queryRaw<{ id: string }[]>(everyone));
    const rows = leadExportRowsQuery(ids.slice(0, 1000).map((lead) => lead.id));
    for (const query of [everyone, mine, rows]) expect(query.sql).not.toMatch(/\bOFFSET\b/i);
    for (const [name, query] of [
      ["everyone", everyone],
      ["mine", mine],
      ["rows", rows],
    ] as const) {
      const plan = await inOrg((tx) => planOf(tx, query));
      expect(
        plan.seqScans.filter((table) => ["lead", "person"].includes(table)),
        `${name}: ${plan.text}`,
      ).toEqual([]);
    }
  });

  it("makes about 3 MB of .xlsx and 9 MB of CSV", async () => {
    if (!sizes.has("xlsx")) await exported("xlsx");
    const csv = await exported("csv");
    expect(csv.detail).toMatchObject({ status: "ready", rowsDone: LEADS });
    const xlsxMb = (sizes.get("xlsx") ?? 0) / MB;
    const csvMb = (sizes.get("csv") ?? 0) / MB;
    expect(xlsxMb).toBeGreaterThan(2);
    expect(xlsxMb).toBeLessThan(5);
    expect(csvMb).toBeGreaterThan(6);
    expect(csvMb).toBeLessThan(13);
  }, 120_000);
});
