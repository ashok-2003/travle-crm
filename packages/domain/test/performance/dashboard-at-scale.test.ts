// The dashboard stays fast in a large agency (spec 7, ADR 0028): with 50,000 leads and their timeline, the longest
// period (90 days) is computed within its time budget for a manager (everyone's leads) and for a salesperson (their
// own), as the api does, as app_runtime inside forOrg, beside a neighbouring agency's 100,000 leads. Every query reads
// an index on its organization's rows, never the whole table.
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import {
  analyzeTables,
  createIsolatedDatabase,
  createTestOrganization,
  type IsolatedDatabase,
} from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { dashboardFigures } from "../../src/insights/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { seedLargeAgency } from "./large-agency.js";
import { fastestMs } from "./query-plans.js";

const SIZE = { leads: 50_000, tasks: 100_000, staff: 500, destinations: 300 };
const NEIGHBOUR = { leads: 100_000, tasks: 0, staff: 500, destinations: 300 };

describe("the dashboard in a large agency", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let salesperson: MemberAccess;
  const timings = new Map<string, number>();

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  /** A lead's first reply and its timeline: created for every lead, and a move to its stage for those past New. */
  async function seedTimeline(organization: string): Promise<void> {
    await platform.$executeRaw`
      UPDATE lead SET first_reply_at = created_at + (abs(hashtext(id::text)) % 600) * interval '1 minute'
      WHERE organization_id = ${organization}::uuid AND stage NOT IN ('new', 'not_a_lead')`;
    await platform.$executeRaw`
      INSERT INTO lead_timeline_entry (organization_id, id, lead_id, kind, occurred_at)
      SELECT organization_id, uuidv7(), id, 'created', created_at FROM lead WHERE organization_id = ${organization}::uuid`;
    await platform.$executeRaw`
      INSERT INTO lead_timeline_entry (organization_id, id, lead_id, kind, occurred_at, stage)
      SELECT organization_id, uuidv7(), id, 'stage-changed', first_reply_at, stage
      FROM lead WHERE organization_id = ${organization}::uuid AND first_reply_at IS NOT NULL`;
    await analyzeTables(isolated.urls, ["lead", "lead_timeline_entry"]);
  }

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Large agency");
    const { ownerUserIds } = await seedLargeAgency(platform, isolated.urls, organizationId, SIZE);
    await seedTimeline(organizationId);
    const neighbour = await createTestOrganization(platform, "Neighbouring agency");
    await seedLargeAgency(platform, isolated.urls, neighbour, NEIGHBOUR);
    await seedTimeline(neighbour);
    const userId = ownerUserIds[0] ?? "";
    salesperson = memberWithStarterRole("sales", { organizationId, userId });
    manager = memberWithStarterRole("org-admin", { organizationId, userId });
  }, 600_000);

  afterAll(async () => {
    console.info("Dashboard, large agency:", JSON.stringify(Object.fromEntries(timings)));
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  it("computes 90 days for everyone's leads within a second", async () => {
    const figures = await inOrg((tx) => dashboardFigures(tx, manager, "90d", new Date()));
    expect(figures.scope).toBe("all");
    expect(figures.totals.newLeads).toBeGreaterThan(10_000);
    const ms = await fastestMs(() => inOrg((tx) => dashboardFigures(tx, manager, "90d", new Date())));
    timings.set("everyone-90d", Math.round(ms));
    expect(ms).toBeLessThan(1000);
  });

  it("computes 90 days for a salesperson's own leads within a second", async () => {
    const figures = await inOrg((tx) => dashboardFigures(tx, salesperson, "90d", new Date()));
    expect(figures.scope).toBe("own");
    const ms = await fastestMs(() => inOrg((tx) => dashboardFigures(tx, salesperson, "90d", new Date())));
    timings.set("own-90d", Math.round(ms));
    expect(ms).toBeLessThan(1000);
  });
});
