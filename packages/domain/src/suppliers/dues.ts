// What the agency owes its suppliers (release 7a): the unpaid, unvoided costs by supplier with their due dates, the overdue
// ones first and red; and the daily job that tells whoever keeps the accounts about a cost falling due within two days, once
// for each cost. "Mark paid" is finance's (markTripCostPaid); this only reads and reminds.
import { dues, type Dues } from "@travel-crm/contracts/suppliers";
import type { Database, OrgTx } from "@travel-crm/db";
import { noticeKey } from "../crm/index.js";
import type { Identity } from "../identity/index.js";
import { addDays, calendarDateIn, formatMoney, money, systemActor, type CalendarDate } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { forEachFullAccessAgency, type AgencyLoopDependencies } from "../subscriptions/index.js";

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
/** The queue of the daily look, and the notification kind it sends. */
export const SUPPLIER_DUES_QUEUE = "suppliers.due-soon";
export const SUPPLIER_DUE_SOON_KIND = "supplier-cost.due-soon";
/** A cost is mentioned when it falls due within this many days (or is past due). */
export const DUE_SOON_DAYS = 2;
const MOST_READ = 1000;
const dayWords = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const amountOf = (cost: { amountPaise: bigint }) => formatMoney(money(Number(cost.amountPaise)));

/** Unpaid costs grouped by supplier (or by the name typed, for a cost never linked), overdue ones first. */
export async function supplierDues(tx: OrgTx, today: CalendarDate): Promise<Dues> {
  const rows = await tx.tripCost.findMany({
    where: { voidedAt: null, paidOn: null },
    orderBy: [{ dueOn: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    take: MOST_READ,
    select: {
      id: true,
      category: true,
      supplier: true,
      supplierId: true,
      amountPaise: true,
      dueOn: true,
      note: true,
      quoteId: true,
      departureId: true,
      supplierRecord: { select: { name: true } },
      quote: { select: { title: true, lead: { select: { person: { select: { name: true } } } } } },
      departure: { select: { title: true } },
    },
  });
  const groups = new Map<string, Dues["groups"][number]>();
  for (const row of rows) {
    const name = row.supplierRecord?.name ?? row.supplier;
    const key = row.supplierId ?? `name:${name.toLowerCase()}`;
    const amountPaise = Number(row.amountPaise);
    const dueOn = row.dueOn === null ? null : dayOf(row.dueOn);
    const overdue = dueOn !== null && dueOn < today;
    const group = groups.get(key) ?? { supplierId: row.supplierId, name, owedPaise: 0, overduePaise: 0, items: [] };
    group.owedPaise += amountPaise;
    if (overdue) group.overduePaise += amountPaise;
    group.items.push({
      id: row.id,
      category: row.category as Dues["groups"][number]["items"][number]["category"],
      amountPaise,
      dueOn,
      overdue,
      note: row.note,
      forTitle: row.quote === null ? (row.departure?.title ?? "") : `${row.quote.lead.person.name}, ${row.quote.title}`,
      quoteId: row.quoteId,
      departureId: row.departureId,
    });
    groups.set(key, group);
  }
  const ordered = [...groups.values()].sort(
    (a, b) =>
      Number(b.overduePaise > 0) - Number(a.overduePaise > 0) ||
      b.owedPaise - a.owedPaise ||
      a.name.localeCompare(b.name),
  );
  return dues.parse({
    totalPaise: ordered.reduce((total, group) => total + group.owedPaise, 0),
    overduePaise: ordered.reduce((total, group) => total + group.overduePaise, 0),
    groups: ordered,
  });
}

export interface SupplierJobDependencies extends AgencyLoopDependencies {
  db: Database;
  identity: Pick<Identity, "organizationsPage" | "membersHolding">;
}

/**
 * Each day, whoever holds accounts:edit is told of a supplier cost due within two days (or already past due and never
 * mentioned). The notification is keyed on the cost, so a cost is mentioned once however many days the job looks at it.
 */
export async function runSupplierDueSoon(dependencies: SupplierJobDependencies, now: Date): Promise<number> {
  return forEachFullAccessAgency(dependencies, "The supplier dues reminder failed for an agency", async (agency) => {
    const keepers = await dependencies.identity.membersHolding(agency.id, "accounts:edit");
    if (keepers.length === 0) return 0;
    const today = calendarDateIn(now, agency.timeZone);
    return dependencies.db.forOrg(agency.id, async (tx) => {
      const soon = await tx.tripCost.findMany({
        where: { voidedAt: null, paidOn: null, dueOn: { lte: asDate(addDays(today, DUE_SOON_DAYS)) } },
        orderBy: [{ dueOn: "asc" }, { id: "asc" }],
        take: 200,
        select: {
          id: true,
          supplier: true,
          amountPaise: true,
          dueOn: true,
          supplierRecord: { select: { name: true } },
        },
      });
      const actor = systemActor(agency.id);
      let told = 0;
      for (const cost of soon) {
        const created = await notify(tx, actor, {
          recipientUserIds: keepers,
          sourceEventId: noticeKey(cost.id, SUPPLIER_DUE_SOON_KIND),
          kind: SUPPLIER_DUE_SOON_KIND,
          title: `Payment due: ${cost.supplierRecord?.name ?? cost.supplier}`,
          body: cost.dueOn === null ? amountOf(cost) : `${amountOf(cost)} is due on ${dayWords.format(cost.dueOn)}.`,
          link: "/suppliers/dues",
          channels: ["push"],
        });
        if (created.length > 0) told += 1;
      }
      return told;
    });
  });
}
