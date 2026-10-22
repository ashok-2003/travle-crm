// The dashboard's figures (release B): a period's new leads counted in the agency's zone (India here) by day, source,
// stage, destination and wait for a first reply, with the moves to Quote sent and Won the timeline recorded during
// it; everyone's with the team for a role that sees all leads, only the person's own for anyone else. Deleted leads
// and leads from outside the period never count.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { dashboardFigures, daysOf, periodDays } from "../../src/insights/index.js";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { aLead, aTask } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const at = (iso: string) => new Date(iso);
const MINUTE_MS = 60 * 1000;
// 17 Oct 2026, 12:00 in India.
const NOW = at("2026-10-17T06:30:00Z");

describe("periodDays", () => {
  it("counts back from today, or starts on the first of the month", () => {
    const today = parseCalendarDate("2026-10-17");
    expect(periodDays("7d", today)).toEqual({ first: "2026-10-11", last: "2026-10-17" });
    expect(periodDays("30d", today)).toEqual({ first: "2026-09-18", last: "2026-10-17" });
    expect(periodDays("month", today)).toEqual({ first: "2026-10-01", last: "2026-10-17" });
    expect(daysOf(periodDays("7d", today))).toHaveLength(7);
  });
});

describe("dashboardFigures", () => {
  let platform: PlatformClient;
  let db: Database;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  /** An agency of its own for each test, so no test's leads count in another's. */
  async function anAgency() {
    const organizationId = await createTestOrganization(platform, "Dashboard");
    const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => db.forOrg(organizationId, work);
    const owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    const sales = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    const figures = (access: MemberAccess) => inOrg((tx) => dashboardFigures(tx, access, "7d", NOW));
    return { inOrg, owner, sales, figures };
  }

  const moved = (tx: OrgTx, leadId: string, stage: string, occurredAt: Date) =>
    tx.leadTimelineEntry.create({ data: { leadId, kind: "stage-changed", stage, occurredAt } });

  it("counts the period's new leads, their replies and the moves made during it, for the agency", async () => {
    const { inOrg, owner, sales, figures } = await anAgency();
    await inOrg(async (tx) => {
      const created = at("2026-10-15T05:00:00Z");
      const replied = (minutes: number) => new Date(created.getTime() + minutes * MINUTE_MS);
      const kashmir = await tx.destination.create({ data: { name: "Kashmir" } });
      await aLead(tx, { ownerUserId: sales.userId, createdAt: created, source: "google_sheet" });
      await aLead(tx, {
        ownerUserId: sales.userId,
        createdAt: created,
        firstReplyAt: replied(10),
        stage: "contacted",
        destinationId: kashmir.id,
      });
      const won = await aLead(tx, {
        ownerUserId: owner.userId,
        createdAt: created,
        firstReplyAt: replied(30),
        stage: "won",
        destinationId: kashmir.id,
      });
      await moved(tx, won.id, "quote_sent", at("2026-10-16T05:00:00Z"));
      await moved(tx, won.id, "won", at("2026-10-16T09:00:00Z"));
      // 20:00 on 16 Oct in UTC is past midnight in India: the 17th there.
      await aLead(tx, { ownerUserId: sales.userId, createdAt: at("2026-10-16T20:00:00Z") });
      // Before the period, though Won during it: a move, not a new lead.
      const older = await aLead(tx, { ownerUserId: owner.userId, createdAt: at("2026-09-01T05:00:00Z"), stage: "won" });
      await moved(tx, older.id, "won", at("2026-10-14T05:00:00Z"));
      const gone = await aLead(tx, { ownerUserId: sales.userId, createdAt: created });
      await tx.lead.update({ where: { id: gone.id }, data: { deletedAt: NOW } });
      await aTask(tx, { assigneeUserId: sales.userId, dueAt: at("2026-10-16T05:00:00Z") });
    });

    const dashboard = await figures(owner);
    expect(dashboard).toMatchObject({ scope: "all", from: "2026-10-11", to: "2026-10-17" });
    expect(dashboard.totals).toEqual({
      newLeads: 4,
      contacted: 2,
      medianFirstReplyMinutes: 20,
      quotesSent: 1,
      won: 2,
      newLeadsWon: 1,
      open: 3,
      overdue: 1,
    });
    expect(dashboard.perDay.map(({ day, leads }) => `${day}:${String(leads)}`)).toEqual([
      "2026-10-11:0",
      "2026-10-12:0",
      "2026-10-13:0",
      "2026-10-14:0",
      "2026-10-15:3",
      "2026-10-16:0",
      "2026-10-17:1",
    ]);
    expect(dashboard.bySource).toEqual([
      { source: "phone_call", leads: 3, won: 1 },
      { source: "google_sheet", leads: 1, won: 0 },
    ]);
    expect(dashboard.byStage.filter(({ leads }) => leads > 0)).toEqual([
      { stage: "new", leads: 2 },
      { stage: "contacted", leads: 1 },
      { stage: "won", leads: 1 },
    ]);
    expect(dashboard.topDestinations).toEqual([{ name: "Kashmir", leads: 2 }]);
    expect(dashboard.responseTimes).toEqual(
      expect.arrayContaining([
        { bucket: "under15m", leads: 1 },
        { bucket: "under1h", leads: 1 },
        { bucket: "waiting", leads: 2 },
      ]),
    );
    expect(dashboard.team).toEqual([
      { userId: sales.userId, leads: 3, contacted: 1, won: 0 },
      { userId: owner.userId, leads: 1, contacted: 1, won: 1 },
    ]);
  });

  it("counts a lead imported past New as contacted, and leaves it and a Not a lead out of the waits", async () => {
    const { inOrg, owner, figures } = await anAgency();
    await inOrg(async (tx) => {
      const created = at("2026-10-15T05:00:00Z");
      // Imported in Contacted: no first reply was ever recorded, so its wait is unknown.
      await aLead(tx, { ownerUserId: owner.userId, createdAt: created, stage: "contacted" });
      // Marked Not a lead: never contacted, and not waiting either.
      await aLead(tx, { ownerUserId: owner.userId, createdAt: created, stage: "not_a_lead" });
      // Still New with no reply: the one that is waiting.
      await aLead(tx, { ownerUserId: owner.userId, createdAt: created });
    });
    const dashboard = await figures(owner);
    expect(dashboard.totals).toMatchObject({ newLeads: 3, contacted: 1, medianFirstReplyMinutes: null });
    expect(dashboard.responseTimes).toEqual([{ bucket: "waiting", leads: 1 }]);
    expect(dashboard.team).toEqual([{ userId: owner.userId, leads: 3, contacted: 1, won: 0 }]);
  });

  it("shows a salesperson only their own leads and work, without the team", async () => {
    const { inOrg, owner, sales, figures } = await anAgency();
    await inOrg(async (tx) => {
      const created = at("2026-10-16T05:00:00Z");
      await aLead(tx, { ownerUserId: sales.userId, createdAt: created });
      await aLead(tx, { ownerUserId: owner.userId, createdAt: created });
      await aLead(tx, { ownerUserId: null, createdAt: created });
      await aTask(tx, { assigneeUserId: owner.userId, dueAt: at("2026-10-16T05:00:00Z") });
    });

    const dashboard = await figures(sales);
    expect(dashboard.scope).toBe("own");
    expect(dashboard.totals).toMatchObject({ newLeads: 1, open: 1, overdue: 0 });
    expect(dashboard.team).toEqual([]);
    expect((await figures(owner)).totals.newLeads).toBe(3);
  });
});
