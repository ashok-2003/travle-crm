// Today's two sections of release 5 (spec 3.3, 4.4): a quote the customer opened over a day ago and then went quiet on,
// and a payment of an accepted quote that is due soon or missed. Both are the person's own leads' only.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { dismissOpenedQuote } from "../../src/sales/index.js";
import { todaySection, todaySummary } from "../../src/today/index.js";
import { aLead } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const HOUR = 3_600_000;
const now = new Date("2026-10-29T06:30:00Z"); // 12:00 on 29 Oct in India
const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

describe("today's opened quotes and payments due", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const aSalesperson = (): MemberAccess => memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  const section = (access: MemberAccess, name: "quote-opened" | "payments-due") =>
    inOrg((tx) => todaySection(tx, access, { section: name, limit: 20 }, now));
  const counts = async (access: MemberAccess) => (await inOrg((tx) => todaySummary(tx, access, now))).counts;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Today quotes");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  /** A lead of the person with a sent quote opened `opens` times, the last `hoursAgo` hours ago. */
  const openedQuote = (me: MemberAccess, hoursAgo: number, opens = 1) =>
    inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: me.userId, stage: "quote_sent" });
      const quote = await tx.quote.create({
        data: {
          leadId: lead.id,
          title: "Spiti 6 days",
          status: "sent",
          subtotalPaise: 100_00,
          totalPaise: 100_00,
          updatedAt: ago(hoursAgo + 48),
        },
        select: { id: true },
      });
      for (let open = 0; open < opens; open += 1) {
        await tx.leadSignal.create({
          data: { leadId: lead.id, kind: "quote_opened", sourceKey: randomUUID(), at: ago(hoursAgo + open) },
        });
      }
      return { lead, quote };
    });

  describe("quote opened, no reply", () => {
    it("lists a quote opened over a day ago with its opens, and not a fresher one", async () => {
      const me = aSalesperson();
      const quiet = await openedQuote(me, 30, 3);
      await openedQuote(me, 5);
      const { items } = await section(me, "quote-opened");
      expect(items).toMatchObject([
        {
          kind: "quote-opened",
          quote: { id: quiet.quote.id, title: "Spiti 6 days" },
          opens: 3,
          lead: { id: quiet.lead.id },
        },
      ]);
      expect((await counts(me)).quoteOpened).toBe(1);
    });

    it("leaves out someone else's lead", async () => {
      const me = aSalesperson();
      await openedQuote(aSalesperson(), 30);
      expect((await section(me, "quote-opened")).items).toEqual([]);
    });

    it("goes away when a note or a call is put on the lead after the open", async () => {
      const me = aSalesperson();
      const noted = await openedQuote(me, 30);
      await inOrg((tx) =>
        tx.leadTimelineEntry.create({ data: { leadId: noted.lead.id, kind: "note", occurredAt: ago(2) } }),
      );
      const called = await openedQuote(me, 30);
      await inOrg((tx) =>
        tx.leadTimelineEntry.create({ data: { leadId: called.lead.id, kind: "call", occurredAt: ago(2) } }),
      );
      const items = (await section(me, "quote-opened")).items;
      expect(items.map((item) => (item.kind === "quote-opened" ? item.lead.id : ""))).not.toContain(noted.lead.id);
      expect(items.map((item) => (item.kind === "quote-opened" ? item.lead.id : ""))).not.toContain(called.lead.id);
    });

    it("goes away when another quote of the lead changed after the open", async () => {
      const me = aSalesperson();
      const { lead } = await openedQuote(me, 30);
      expect((await section(me, "quote-opened")).items).toHaveLength(1);
      await inOrg((tx) =>
        tx.quote.create({
          data: {
            leadId: lead.id,
            title: "A second quote",
            status: "sent",
            subtotalPaise: 100_00,
            totalPaise: 100_00,
            updatedAt: ago(2),
          },
        }),
      );
      expect((await section(me, "quote-opened")).items).toEqual([]);
    });

    it("carries on after a cursor whose item has gone, instead of starting over", async () => {
      const me = aSalesperson();
      const first = await openedQuote(me, 80);
      const second = await openedQuote(me, 60);
      const third = await openedQuote(me, 40);
      const page = await inOrg((tx) => todaySection(tx, me, { section: "quote-opened", limit: 2 }, now));
      expect(page.items.map((item) => (item.kind === "quote-opened" ? item.quote.id : ""))).toEqual([
        first.quote.id,
        second.quote.id,
      ]);
      expect(page.nextCursor).toBe(second.quote.id);
      await inOrg((tx) => dismissOpenedQuote(tx, me, second.lead.id, now));
      const next = await inOrg((tx) =>
        todaySection(tx, me, { section: "quote-opened", after: second.quote.id, limit: 2 }, now),
      );
      expect(next.items.map((item) => (item.kind === "quote-opened" ? item.quote.id : ""))).toEqual([third.quote.id]);
    });

    it("comes back only after a newer open once it is marked Done", async () => {
      const me = aSalesperson();
      const { lead } = await openedQuote(me, 30);
      await inOrg((tx) => dismissOpenedQuote(tx, me, lead.id, now));
      expect((await section(me, "quote-opened")).items).toEqual([]);
      await inOrg((tx) =>
        tx.leadSignal.create({ data: { leadId: lead.id, kind: "quote_opened", sourceKey: randomUUID(), at: ago(26) } }),
      );
      expect((await section(me, "quote-opened")).items).toHaveLength(1);
      const audit = await inOrg((tx) => tx.auditEntry.findMany({ where: { entityId: lead.id } }));
      expect(audit.map((entry) => entry.action)).toContain("sales.quote-opened-dismissed");
    });
  });

  describe("payments due", () => {
    const acceptedQuote = (me: MemberAccess, installments: { amount: number; dueOn: string }[], paid = 0) =>
      inOrg(async (tx) => {
        const lead = await aLead(tx, { ownerUserId: me.userId, stage: "booking_requested" });
        const quote = await tx.quote.create({
          data: { leadId: lead.id, title: "Goa", status: "accepted", subtotalPaise: 900_000, totalPaise: 900_000 },
          select: { id: true },
        });
        const ids: string[] = [];
        for (const [index, installment] of installments.entries()) {
          const row = await tx.quoteInstallment.create({
            data: {
              quoteId: quote.id,
              label: `Part ${String(index + 1)}`,
              amountPaise: BigInt(installment.amount),
              dueOn: new Date(installment.dueOn),
            },
            select: { id: true },
          });
          ids.push(row.id);
        }
        if (paid > 0) {
          await tx.quotePayment.create({
            data: { quoteId: quote.id, amountPaise: BigInt(paid), receivedOn: new Date("2026-10-01"), method: "upi" },
          });
        }
        return { lead, quote, ids };
      });

    it("lists the unpaid instalments within the reminder day and the missed ones, earliest first", async () => {
      const me = aSalesperson();
      const { ids } = await acceptedQuote(me, [
        { amount: 300_000, dueOn: "2026-10-20" },
        { amount: 300_000, dueOn: "2026-10-30" },
        { amount: 300_000, dueOn: "2026-11-20" },
      ]);
      const { items } = await section(me, "payments-due");
      expect(items).toMatchObject([
        { kind: "payment-due", installmentId: ids[0], missed: true, amountPaise: 300_000, dueOn: "2026-10-20" },
        { kind: "payment-due", installmentId: ids[1], missed: false, dueOn: "2026-10-30" },
      ]);
      expect((await counts(me)).paymentsDue).toBe(2);
    });

    it("carries on after a cursor whose payment has been made, instead of starting over", async () => {
      const me = aSalesperson();
      const { ids, quote } = await acceptedQuote(me, [
        { amount: 100_000, dueOn: "2026-10-18" },
        { amount: 100_000, dueOn: "2026-10-19" },
        { amount: 100_000, dueOn: "2026-10-20" },
      ]);
      const page = await inOrg((tx) => todaySection(tx, me, { section: "payments-due", limit: 2 }, now));
      expect(page.nextCursor).toBe(ids[1]);
      // The first two instalments are paid: the cursor's item leaves the list.
      await inOrg((tx) =>
        tx.quotePayment.create({
          data: { quoteId: quote.id, amountPaise: 200_000n, receivedOn: new Date("2026-10-28"), method: "upi" },
        }),
      );
      const next = await inOrg((tx) =>
        todaySection(tx, me, { section: "payments-due", after: ids[1] ?? "", limit: 2 }, now),
      );
      expect(next.items).toMatchObject([{ installmentId: ids[2] }]);
    });

    it("skips an instalment the payments cover, and a quote that is not accepted", async () => {
      const me = aSalesperson();
      const covered = await acceptedQuote(me, [{ amount: 300_000, dueOn: "2026-10-20" }], 300_000);
      await inOrg((tx) => tx.quote.update({ where: { id: covered.quote.id }, data: { updatedAt: now } }));
      const sent = await acceptedQuote(me, [{ amount: 300_000, dueOn: "2026-10-20" }]);
      await inOrg((tx) => tx.quote.update({ where: { id: sent.quote.id }, data: { status: "sent" } }));
      expect((await section(me, "payments-due")).items).toEqual([]);
    });

    it("leaves out someone else's lead", async () => {
      const me = aSalesperson();
      await acceptedQuote(aSalesperson(), [{ amount: 300_000, dueOn: "2026-10-20" }]);
      expect((await counts(me)).paymentsDue).toBe(0);
    });
  });
});
