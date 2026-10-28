// Writing quotes (step 3, P0): a member makes one for a lead they may see, changes it while it is a draft, sends, marks
// it accepted or declined, makes a new version of a sent one, or deletes it. A sent quote keeps its prices (spec 4.3).
// Totals are worked out here from its lines, never taken from the browser; every change is
// audited and counted (version), so its PDF is issued again only when it changed. Sending moves the lead to Quote sent,
// accepting to Booking requested, forward only.
import type {
  CreateQuoteInput,
  ListQuotesInput,
  QuoteDetail,
  QuoteSummary,
  SetQuoteStatusInput,
  UpdateQuoteInput,
} from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { softDeleted } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { advanceLeadStage, getLead } from "../crm/index.js";
import { scopeFilter, type MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import {
  assertDraft,
  copyOf,
  findQuoteForChange,
  findQuoteInScope,
  quoteColumns,
  toDetail,
  toSummary,
} from "./quote-rows.js";
import { quoteMoney } from "./totals.js";

/** What every quote write needs from outside: the agency's GST state (its profile), and the one time of the change. */
export interface QuoteContext {
  supplierStateCode: string | null;
  now: Date;
}

type Fields = Omit<CreateQuoteInput, "leadId">;

function columnsOf(fields: Fields, context: QuoteContext) {
  const totals = quoteMoney(
    fields.items,
    fields.taxRateBasisPoints,
    context.supplierStateCode ?? "",
    fields.placeOfSupply,
  );
  return {
    title: fields.title,
    startDate: fields.startDate === null ? null : new Date(`${fields.startDate}T00:00:00Z`),
    adults: fields.adults,
    children: fields.children,
    days: fields.days,
    items: fields.items,
    inclusions: fields.inclusions,
    exclusions: fields.exclusions,
    notes: fields.notes,
    taxRateBasisPoints: fields.taxRateBasisPoints,
    placeOfSupply: fields.placeOfSupply,
    subtotalPaise: BigInt(totals.subtotalPaise),
    taxPaise: BigInt(totals.taxPaise),
    totalPaise: BigInt(totals.totalPaise),
  };
}

/** A quote's amounts in an audit entry: what changed in money, never the customer's words. */
const auditView = (row: { title: string; totalPaise: bigint; status: string }) => ({
  title: row.title,
  totalPaise: Number(row.totalPaise),
  status: row.status,
});

export async function createQuote(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateQuoteInput,
  context: QuoteContext,
): Promise<QuoteDetail> {
  // The lead must be the member's to see; another's is "not found", as everywhere.
  const lead = await getLead(tx, access, input.leadId);
  const created = await tx.quote.create({
    data: { leadId: lead.id, ...columnsOf(input, context), createdBy: access.userId },
    select: { id: true, title: true, totalPaise: true, status: true },
  });
  await recordAudit(tx, access, {
    action: "quote.created",
    entityType: "quote",
    entityId: created.id,
    after: auditView(created),
  });
  return toDetail(await findQuoteInScope(tx, access, created.id));
}

export async function updateQuote(
  tx: OrgTx,
  access: MemberAccess,
  input: UpdateQuoteInput,
  context: QuoteContext,
): Promise<QuoteDetail> {
  const before = await findQuoteForChange(tx, access, input.quoteId);
  assertDraft(before);
  const after = await tx.quote.update({
    where: { id: before.id },
    data: { ...columnsOf(input, context), version: { increment: 1 } },
    select: { title: true, totalPaise: true, status: true },
  });
  await recordAudit(tx, access, {
    action: "quote.changed",
    entityType: "quote",
    entityId: before.id,
    before: auditView(before),
    after: auditView(after),
  });
  return toDetail(await findQuoteInScope(tx, access, before.id));
}

/** What each status may move to by hand: a draft is sent, a sent quote is accepted or declined, nothing else moves. */
const allowedMoves: Record<string, readonly string[]> = { draft: ["sent"], sent: ["accepted", "declined"] };

export async function setQuoteStatus(
  tx: OrgTx,
  access: MemberAccess,
  input: SetQuoteStatusInput,
  now: Date,
  /** The agency's GST state, frozen on the quote when it is sent. */
  supplierStateCode: string | null = null,
): Promise<QuoteDetail> {
  const before = await findQuoteForChange(tx, access, input.quoteId);
  if (before.status !== input.status) {
    if (!(allowedMoves[before.status] ?? []).includes(input.status)) {
      throw new DomainError("CONFLICT", "QUOTE_STATUS_LOCKED", "This quote can't be moved to that status");
    }
    if (input.status === "sent") assertInstallmentsAddUp(before);
    await tx.quote.update({
      where: { id: before.id },
      data: {
        status: input.status,
        ...(input.status === "sent" ? { sentAt: now, supplierStateCode } : {}),
        ...(input.status === "accepted" ? { acceptedAt: now, acceptedName: null } : {}),
      },
    });
    await recordAudit(tx, access, {
      action: "quote.status-changed",
      entityType: "quote",
      entityId: before.id,
      before: { status: before.status },
      after: { status: input.status },
    });
    if (input.status === "sent")
      await advanceLeadStage(tx, access, { leadId: before.leadId, stage: "quote_sent" }, now);
    if (input.status === "accepted") {
      await advanceLeadStage(tx, access, { leadId: before.leadId, stage: "booking_requested" }, now);
    }
  }
  return toDetail(await findQuoteInScope(tx, access, before.id));
}

/** The payments due, when there are any, add up to the total: what the customer reads is what they can pay. */
function assertInstallmentsAddUp(quote: { installments: { amountPaise: bigint }[]; totalPaise: bigint }): void {
  if (quote.installments.length === 0) return;
  const due = quote.installments.reduce((total, row) => total + row.amountPaise, 0n);
  if (due !== quote.totalPaise) {
    throw new DomainError("CONFLICT", "INSTALLMENTS_MISMATCH", "The payments due must add up to the quote's total");
  }
}

/**
 * Makes a new version of a sent (or declined) quote: a draft copy to change, which replaces it. The old quote keeps its
 * prices, and its link says it was replaced. An accepted quote is the booking and is not replaced.
 */
export async function newQuoteVersion(
  tx: OrgTx,
  access: MemberAccess,
  quoteId: string,
  context: QuoteContext,
): Promise<QuoteDetail> {
  const old = await findQuoteForChange(tx, access, quoteId);
  if (old.status !== "sent" && old.status !== "declined") {
    throw new DomainError(
      "CONFLICT",
      "QUOTE_NOT_REPLACEABLE",
      "Only a quote that was sent or declined can have a new version",
    );
  }
  const draft = await createQuote(tx, access, copyOf(old), context);
  await tx.quoteInstallment.createMany({
    data: old.installments.map((due) => ({
      quoteId: draft.id,
      label: due.label,
      amountPaise: due.amountPaise,
      dueOn: due.dueOn,
    })),
  });
  await tx.quote.update({ where: { id: old.id }, data: { status: "replaced", replacedById: draft.id } });
  await recordAudit(tx, access, {
    action: "quote.replaced",
    entityType: "quote",
    entityId: old.id,
    before: { status: old.status },
    after: { status: "replaced", replacedById: draft.id },
  });
  return getQuote(tx, access, draft.id);
}

/**
 * Gone from every list. A quote with money recorded on it stays (void the payments first), and so does one that is the booking:
 * accepted, invoiced or carrying costs.
 */
export async function deleteQuote(tx: OrgTx, access: MemberAccess, quoteId: string): Promise<void> {
  const quote = await findQuoteForChange(tx, access, quoteId);
  if (quote.payments.length > 0) {
    throw new DomainError("CONFLICT", "QUOTE_HAS_PAYMENTS", "This quote has payments recorded on it");
  }
  if (
    quote.status === "accepted" ||
    quote.invoiceDocumentId !== null ||
    (await tx.tripCost.count({ where: { quoteId: quote.id } })) > 0
  ) {
    throw new DomainError("CONFLICT", "QUOTE_NOT_DELETABLE", "An accepted quote is the booking and can't be deleted");
  }
  await tx.quote.update({ where: { id: quote.id }, data: softDeleted(access.userId) });
  await recordAudit(tx, access, {
    action: "quote.deleted",
    entityType: "quote",
    entityId: quote.id,
    before: auditView(quote),
  });
}

export async function getQuote(tx: OrgTx, access: MemberAccess, quoteId: string): Promise<QuoteDetail> {
  return toDetail(await findQuoteInScope(tx, access, quoteId));
}

/** A lead's quotes, newest first. */
export async function listLeadQuotes(tx: OrgTx, access: MemberAccess, leadId: string): Promise<QuoteSummary[]> {
  const lead = await getLead(tx, access, leadId);
  const rows = await tx.quote.findMany({
    where: { leadId: lead.id, lead: scopeFilter(access, "quotes:view", "ownerUserId") },
    orderBy: { createdAt: "desc" },
    select: quoteColumns,
  });
  return rows.map(toSummary);
}

/** The member's quotes (or the agency's, for a role that sees all), recently changed first, 200 at most. */
export async function listQuotes(tx: OrgTx, access: MemberAccess, input: ListQuotesInput): Promise<QuoteSummary[]> {
  const rows = await tx.quote.findMany({
    where: {
      lead: scopeFilter(access, "quotes:view", "ownerUserId"),
      ...(input.status === undefined ? {} : { status: input.status }),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: quoteColumns,
  });
  const quotes = rows.map(toSummary);
  return input.balanceDue === true
    ? quotes.filter((quote) => quote.status === "accepted" && quote.totals.balancePaise > 0)
    : quotes;
}
