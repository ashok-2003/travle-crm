// The reports' access rules: money only for whoever holds money:view_reports, a staff report's recent actions only with
// audit:view, the team's averages only for a role that sees every lead, and a deleted lead counted nowhere.
import { randomUUID } from "node:crypto";
import { createDatabase, softDeleted, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { aLead } from "../crm/support/records.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { createQuote, recordPayment, setQuoteStatus } from "../../src/quotes/index.js";
import { salesReportOf, staffReportOf } from "../../src/reports/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const now = new Date("2026-11-10T06:00:00Z");

describe("reports", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: MemberAccess;
  let seller: MemberAccess;
  let colleague: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  /** A booking of ₹10,000 plus GST on a lead of `seller`'s, accepted by a payment. */
  const aBooking = (ownerUserId: string) =>
    inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId, stage: "contacted" });
      const quote = await createQuote(
        tx,
        owner,
        {
          leadId: lead.id,
          title: "Manali",
          startDate: null,
          adults: 2,
          children: 0,
          days: [],
          items: [{ description: "Package", detail: "", quantity: 1, unitPricePaise: 1_000_000 }],
          inclusions: "",
          exclusions: "",
          notes: "",
          taxRateBasisPoints: 500,
          placeOfSupply: null,
        },
        { supplierStateCode: "27", now },
      );
      await setQuoteStatus(tx, owner, { quoteId: quote.id, status: "sent" }, now);
      await recordPayment(
        tx,
        owner,
        {
          quoteId: quote.id,
          amountPaise: 500_000,
          receivedOn: "2026-11-10",
          method: "upi",
          reference: "",
          requestId: randomUUID(),
        },
        now,
      );
      return lead.id;
    });

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Report rules");
    owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    seller = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    colleague = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("shows money to whoever holds money:view_reports and hides it from everyone else", async () => {
    await aBooking(seller.userId);
    const asOwner = await inOrg((tx) => salesReportOf(tx, owner, "month", now));
    expect(asOwner).toMatchObject({ showsMoney: true, scope: "all" });
    expect(asOwner.figures.salesPaise).toBe(1_000_000);
    expect(asOwner.figures.collectedPaise).toBe(500_000);
    expect(asOwner.team.find((row) => row.userId === seller.userId)?.salesPaise).toBe(1_000_000);

    const asSeller = await inOrg((tx) => salesReportOf(tx, seller, "month", now));
    expect(asSeller).toMatchObject({ showsMoney: false, scope: "own", pipelinePaise: 0 });
    expect(asSeller.figures).toMatchObject({ salesPaise: 0, collectedPaise: 0 });
    expect(asSeller.bySource.every((row) => row.salesPaise === 0)).toBe(true);
    expect(asSeller.months.every((row) => row.salesPaise === 0)).toBe(true);
  });

  it("counts a deleted lead's quotes nowhere", async () => {
    const before = await inOrg((tx) => salesReportOf(tx, owner, "month", now));
    const leadId = await aBooking(seller.userId);
    const during = await inOrg((tx) => salesReportOf(tx, owner, "month", now));
    expect(during.figures.salesPaise).toBe(before.figures.salesPaise + 1_000_000);
    await inOrg((tx) => tx.lead.update({ where: { id: leadId }, data: softDeleted(owner.userId) }));
    const after = await inOrg((tx) => salesReportOf(tx, owner, "month", now));
    expect(after.figures).toMatchObject({
      salesPaise: before.figures.salesPaise,
      collectedPaise: before.figures.collectedPaise,
      newLeads: before.figures.newLeads,
    });
    expect(after.team.find((row) => row.userId === seller.userId)?.salesPaise).toBe(
      before.team.find((row) => row.userId === seller.userId)?.salesPaise,
    );
  });

  describe("a staff report", () => {
    it("shows the team's averages and recent actions to a role that sees all and may read the audit log", async () => {
      const report = await inOrg((tx) => staffReportOf(tx, owner, { userId: owner.userId, range: "month" }, now));
      expect(report.teamAverage).not.toBeNull();
      expect(report.activity.length).toBeGreaterThan(0);
      expect(report.showsMoney).toBe(true);
    });

    it("gives a member their own report without the team's averages, other people's actions or money", async () => {
      const report = await inOrg((tx) => staffReportOf(tx, seller, { userId: seller.userId, range: "month" }, now));
      expect(report.teamAverage).toBeNull();
      expect(report.activity).toEqual([]);
      expect(report).toMatchObject({ showsMoney: false, person: { salesPaise: 0, collectedPaise: 0 } });
    });

    it("is not found for another person's, to a member who sees only their own", async () => {
      await expect(
        inOrg((tx) => staffReportOf(tx, seller, { userId: colleague.userId, range: "month" }, now)),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
