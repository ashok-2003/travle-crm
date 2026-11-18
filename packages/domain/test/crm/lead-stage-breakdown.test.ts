// Leads by stage for a period (web revamp, Home): every stage of the leads that came in during it, scoped like the
// list: a salesperson's own leads only. "Not a lead" is counted apart and left out of the total.
import { randomUUID } from "node:crypto";
import { stageBreakdown } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { stageBreakdownOf } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead, type LeadSeed } from "./support/records.js";

describe("leads by stage for a period", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let salesperson: MemberAccess;
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const seed = (seeds: LeadSeed[]) =>
    inOrg(async (tx) => {
      for (const one of seeds) await aLead(tx, one);
    });

  beforeAll(() => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  // Each test gets an organization of its own, so the counts never depend on the order the tests run in.
  beforeEach(async () => {
    organizationId = await createTestOrganization(platform, "Stage breakdown");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    salesperson = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("counts every stage of the leads that came in during the period", async () => {
    await seed([
      { stage: "new" },
      { stage: "new" },
      { stage: "contacted" },
      { stage: "quote_sent" },
      { stage: "booking_requested" },
      { stage: "won" },
      { stage: "lost" },
      { stage: "not_a_lead" },
      { stage: "won", createdAt: twoDaysAgo },
    ]);
    const today = await inOrg((tx) => stageBreakdownOf(tx, manager, "today", now));
    expect(today).toEqual({
      total: 7,
      stages: { new: 2, contacted: 1, quote_sent: 1, booking_requested: 1, won: 1, lost: 1, not_a_lead: 1 },
    });
    // What the router returns must satisfy its output schema.
    expect(stageBreakdown.parse(today)).toEqual(today);
    const all = await inOrg((tx) => stageBreakdownOf(tx, manager, "all", now));
    expect(all.total).toBe(8);
    expect(all.stages.won).toBe(2);
  });

  it("a salesperson's breakdown counts only their own leads", async () => {
    await seed([
      { ownerUserId: salesperson.userId, stage: "contacted" },
      { ownerUserId: randomUUID(), stage: "new" },
    ]);
    const own = await inOrg((tx) => stageBreakdownOf(tx, salesperson, "all", now));
    expect(own.total).toBe(1);
    expect(own.stages.contacted).toBe(1);
    expect(own.stages.new).toBe(0);
  });
});
