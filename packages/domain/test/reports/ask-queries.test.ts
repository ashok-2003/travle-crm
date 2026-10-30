// The catalogue behind "ask your reports": every report runs for the asker's own scope, money only for whoever holds
// money:view_reports (a money report is not offered to anyone else), the team report only to a role that sees all, a named
// range becomes days by code, and a report the member may not run is not found.
import { randomUUID } from "node:crypto";
import { reportQueryIds } from "@travel-crm/contracts/reports";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { aLead } from "../crm/support/records.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { reportsFor, runReport } from "../../src/reports/index.js";
import { daysOfRange } from "../../src/reports/queries/range.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const now = new Date("2026-11-10T06:00:00Z");
const today = "2026-11-10" as Parameters<typeof daysOfRange>[1];

describe("the ask-reports catalogue", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: MemberAccess;
  let seller: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Ask reports");
    owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    seller = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    await inOrg(async (tx) => {
      await aLead(tx, { ownerUserId: seller.userId, stage: "won", source: "instagram", createdAt: now });
      await aLead(tx, {
        ownerUserId: owner.userId,
        stage: "lost",
        source: "website",
        lostReason: "price",
        createdAt: now,
      });
    });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("turns each named range into days in the agency's zone", () => {
    expect(daysOfRange("7d", today)).toEqual({ first: "2026-11-04", last: "2026-11-10" });
    expect(daysOfRange("month", today)).toEqual({ first: "2026-11-01", last: "2026-11-10" });
    expect(daysOfRange("last_month", today)).toEqual({ first: "2026-10-01", last: "2026-10-31" });
    expect(daysOfRange("quarter", today)).toEqual({ first: "2026-10-01", last: "2026-11-10" });
    expect(daysOfRange("last_quarter", today)).toEqual({ first: "2026-07-01", last: "2026-09-30" });
    expect(daysOfRange("last_quarter", "2026-02-14" as typeof today)).toEqual({
      first: "2025-10-01",
      last: "2025-12-31",
    });
    expect(daysOfRange("last_month", "2026-01-05" as typeof today)).toEqual({
      first: "2025-12-01",
      last: "2025-12-31",
    });
  });

  it("offers the owner every report, and a seller only those their permissions allow", () => {
    expect(reportsFor(owner).map((entry) => entry.id)).toEqual([...reportQueryIds]);
    const offered = reportsFor(seller).map((entry) => entry.id);
    expect(offered).not.toContain("team");
    expect(offered).not.toContain("payments_collected");
    expect(offered).not.toContain("payments_due");
    expect(offered).toContain("leads_by_source");
  });

  it("runs every report the owner may, with columns and rows in step", async () => {
    for (const queryId of reportQueryIds) {
      const answer = await inOrg((tx) => runReport(tx, owner, { queryId, range: "month" }, now));
      expect(answer.queryId).toBe(queryId);
      for (const row of answer.rows) {
        expect(Object.keys(row).sort()).toEqual(answer.columns.map((column) => column.key).sort());
      }
    }
  });

  it("answers for the leads the asker sees: the seller's sources count only their own lead, the owner's both", async () => {
    const sources = (member: MemberAccess) =>
      inOrg((tx) => runReport(tx, member, { queryId: "leads_by_source", range: "month" }, now));
    const own = await sources(seller);
    expect(own.rows).toEqual([{ source: "instagram", leads: 1, won: 1 }]);
    const all = await sources(owner);
    expect(all.rows.map((row) => row.source).sort()).toEqual(["instagram", "website"]);
    expect(all.columns.some((column) => column.key === "sales")).toBe(true);
    expect(own.columns.some((column) => column.key === "sales")).toBe(false);
  });

  it("gives a range's days and none for a report about now", async () => {
    const ranged = await inOrg((tx) => runReport(tx, owner, { queryId: "lost_leads", range: "last_month" }, now));
    expect(ranged).toMatchObject({ range: "last_month", from: "2026-10-01", to: "2026-10-31" });
    const current = await inOrg((tx) => runReport(tx, owner, { queryId: "follow_ups_overdue" }, now));
    expect(current).toMatchObject({ range: null, from: null, to: null });
  });

  it("does not find a report the member may not run", async () => {
    await expect(inOrg((tx) => runReport(tx, seller, { queryId: "team" }, now))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(inOrg((tx) => runReport(tx, seller, { queryId: "payments_collected" }, now))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
