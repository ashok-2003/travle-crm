// Two kinds of work Today shows besides follow-ups (release 5, spec 3.3, 4.4): quotes the customer opened and then went
// quiet on, and payments about to fall due. Both are plain queries over the person's own leads. An opened quote is
// "quiet" when its latest open is over a day old and since then the customer has not written, nobody has put a note or a
// call on the lead, and no quote of it changed; "Done" marks the opens seen so only a newer open brings it back. A
// payment is due when an accepted quote's instalment is not covered by what was paid and falls within the agency's
// reminder days, or is already missed: the same payments the customers are reminded of.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { getLead } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { addDays, type CalendarDate } from "../kernel/index.js";
import { coveredInstallments } from "../quotes/index.js";
import { salesAutomationOf } from "./settings.js";

const DAY = 24 * 3_600_000;
const OPEN_STAGES = ["new", "contacted", "quote_sent", "booking_requested"];
/** The most one list reads: a person's own leads that are waiting on a customer are far fewer. */
const MOST_READ = 200;

export interface OpenedQuote {
  /** The quote the customer opened last; the item's id. */
  quoteId: string;
  leadId: string;
  title: string;
  opens: number;
  lastOpenedAt: Date;
}

export interface PaymentDue {
  /** The instalment; the item's id. */
  installmentId: string;
  quoteId: string;
  leadId: string;
  amountPaise: number;
  dueOn: CalendarDate;
  missed: boolean;
}

interface Page {
  after?: string | undefined;
  limit: number;
}

/**
 * The rows after the cursor, by the keyset (sort key, then id) the lists are sorted in: a cursor whose row has left the
 * list (marked Done, paid) still has its key, which `keyOfGone` reads, so the next page carries on after its place and
 * never restarts from the first. A cursor with no key at all ends the list.
 */
async function pageOf<Row>(
  rows: Row[],
  keyOf: (row: Row) => string,
  after: string | undefined,
  keyOfCursor: (id: string) => Promise<string | null>,
  limit: number,
  idOf: (row: Row) => string,
): Promise<Row[]> {
  if (after === undefined) return rows.slice(0, limit);
  const present = rows.find((row) => idOf(row) === after);
  const cursorKey = present === undefined ? await keyOfCursor(after) : keyOf(present);
  if (cursorKey === null) return [];
  return rows.filter((row) => keyOf(row) > cursorKey).slice(0, limit);
}

/** Every quote the person's customers opened and then left quiet for a day, oldest open first. */
async function quietOpenedQuotes(tx: OrgTx, ownerUserId: string, now: Date): Promise<OpenedQuote[]> {
  const opens = await tx.leadSignal.groupBy({
    by: ["leadId"],
    where: {
      kind: "quote_opened",
      dismissedAt: null,
      lead: { ownerUserId, deletedAt: null, stage: { in: OPEN_STAGES } },
    },
    _max: { at: true },
    _count: { _all: true },
  });
  const quiet = opens
    .flatMap((row) => (row._max.at === null ? [] : [{ leadId: row.leadId, at: row._max.at, opens: row._count._all }]))
    .filter((row) => now.getTime() - row.at.getTime() > DAY)
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.leadId.localeCompare(b.leadId))
    .slice(0, MOST_READ);
  if (quiet.length === 0) return [];
  const leadIds = quiet.map((row) => row.leadId);
  const leads = await tx.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, personId: true } });
  const personOf = new Map(leads.map((lead) => [lead.id, lead.personId]));
  // What happened on each lead, latest first: a note or a call, a changed quote, a customer's message.
  const work = await tx.leadTimelineEntry.groupBy({
    by: ["leadId"],
    where: { leadId: { in: leadIds }, kind: { in: ["note", "call"] } },
    _max: { occurredAt: true },
  });
  const quotes = await tx.quote.findMany({
    where: { leadId: { in: leadIds }, status: { in: ["sent", "accepted"] } },
    select: { id: true, leadId: true, title: true, updatedAt: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  const chats = await tx.whatsappConversation.findMany({
    where: { personId: { in: [...personOf.values()] }, lastInboundAt: { not: null } },
    select: { personId: true, lastInboundAt: true },
  });
  const latest = (dates: (Date | null | undefined)[]) =>
    dates.reduce<number>((best, date) => Math.max(best, date?.getTime() ?? 0), 0);
  const rows = quiet.flatMap((row) => {
    const quote = quotes.find((candidate) => candidate.leadId === row.leadId);
    if (quote === undefined) return [];
    const personId = personOf.get(row.leadId);
    const since = latest([
      work.find((entry) => entry.leadId === row.leadId)?._max.occurredAt,
      ...quotes.filter((candidate) => candidate.leadId === row.leadId).map((candidate) => candidate.updatedAt),
      ...chats.filter((chat) => chat.personId === personId).map((chat) => chat.lastInboundAt),
    ]);
    // A quote last touched by the open itself (viewed, accepted) is not a change: only a change after the open counts.
    return since > row.at.getTime()
      ? []
      : [{ quoteId: quote.id, leadId: row.leadId, title: quote.title, opens: row.opens, lastOpenedAt: row.at }];
  });
  return rows.sort((a, b) => openedKey(a).localeCompare(openedKey(b)));
}

/** The place of an opened quote in its list: when it was last opened, then its id. */
const openedKey = (row: Pick<OpenedQuote, "lastOpenedAt" | "quoteId">) =>
  `${row.lastOpenedAt.toISOString()}|${row.quoteId}`;

export async function openedQuotesNoReply(
  tx: OrgTx,
  access: MemberAccess,
  page: Page,
  now: Date,
): Promise<OpenedQuote[]> {
  return pageOf(
    await quietOpenedQuotes(tx, access.userId, now),
    openedKey,
    page.after,
    async (quoteId) => {
      // Marked Done since the last page: its opens still say where it stood.
      const quote = await tx.quote.findUnique({ where: { id: quoteId }, select: { leadId: true } });
      if (quote === null) return null;
      const opened = await tx.leadSignal.aggregate({
        where: { leadId: quote.leadId, kind: "quote_opened" },
        _max: { at: true },
      });
      return opened._max.at === null ? null : openedKey({ lastOpenedAt: opened._max.at, quoteId });
    },
    page.limit,
    (row) => row.quoteId,
  );
}

export async function countOpenedQuotesNoReply(tx: OrgTx, access: MemberAccess, now: Date): Promise<number> {
  return (await quietOpenedQuotes(tx, access.userId, now)).length;
}

/** The customer's quote opened again is seen to: its opens up to now no longer bring it back to Today. */
export async function dismissOpenedQuote(tx: OrgTx, access: MemberAccess, leadId: string, now: Date): Promise<void> {
  const lead = await getLead(tx, access, leadId);
  const { count } = await tx.leadSignal.updateMany({
    where: { leadId: lead.id, kind: "quote_opened", dismissedAt: null },
    data: { dismissedAt: now },
  });
  if (count === 0) return;
  await recordAudit(tx, access, {
    action: "sales.quote-opened-dismissed",
    entityType: "lead",
    entityId: lead.id,
  });
}

/** Every payment the person's customers owe soon or have missed, earliest due first. */
async function paymentsDueSoon(tx: OrgTx, ownerUserId: string, today: CalendarDate): Promise<PaymentDue[]> {
  const settings = await salesAutomationOf(tx);
  const horizon = addDays(today, settings.reminderDaysBefore);
  const quotes = await tx.quote.findMany({
    where: {
      status: "accepted",
      lead: { ownerUserId, deletedAt: null },
      installments: { some: { dueOn: { lte: new Date(`${horizon}T00:00:00Z`) } } },
    },
    select: {
      id: true,
      leadId: true,
      installments: { select: { id: true, amountPaise: true, dueOn: true } },
      payments: { where: { voidedAt: null }, select: { amountPaise: true } },
    },
    take: MOST_READ,
  });
  return quotes
    .flatMap((quote) => {
      const paid = quote.payments.reduce((sum, payment) => sum + Number(payment.amountPaise), 0);
      return coveredInstallments(
        quote.installments.map((row) => ({
          id: row.id,
          amountPaise: Number(row.amountPaise),
          dueOn: row.dueOn.toISOString().slice(0, 10),
        })),
        paid,
      )
        .filter((installment) => !installment.paid && installment.dueOn <= horizon)
        .map((installment) => ({
          installmentId: installment.id,
          quoteId: quote.id,
          leadId: quote.leadId,
          amountPaise: installment.amountPaise,
          dueOn: installment.dueOn as CalendarDate,
          missed: installment.dueOn < today,
        }));
    })
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.installmentId.localeCompare(b.installmentId));
}

/** The place of a payment in its list: its due day, then its id. */
const dueKey = (row: { dueOn: string; installmentId: string }) => `${row.dueOn}|${row.installmentId}`;

export async function paymentsDue(
  tx: OrgTx,
  access: MemberAccess,
  page: Page,
  today: CalendarDate,
): Promise<PaymentDue[]> {
  return pageOf(
    await paymentsDueSoon(tx, access.userId, today),
    dueKey,
    page.after,
    async (installmentId) => {
      // Paid since the last page: its due day still says where it stood.
      const row = await tx.quoteInstallment.findUnique({ where: { id: installmentId }, select: { dueOn: true } });
      return row === null ? null : dueKey({ dueOn: row.dueOn.toISOString().slice(0, 10), installmentId });
    },
    page.limit,
    (row) => row.installmentId,
  );
}

export async function countPaymentsDue(tx: OrgTx, access: MemberAccess, today: CalendarDate): Promise<number> {
  return (await paymentsDueSoon(tx, access.userId, today)).length;
}
