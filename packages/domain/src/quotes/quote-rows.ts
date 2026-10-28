// How a quote is read (step 3, P0): its columns, its lead's owner (who may see it: quotes:view's scope is the lead's
// owner, as leads:view's is) and customer, and the shapes the api returns, with what was paid worked out.
import {
  createQuoteInput,
  quoteDay,
  quoteDetail,
  quoteItem,
  quoteSummary,
  quoteTaxRate,
  type CreateQuoteInput,
  type QuoteDetail,
  type QuoteSummary,
} from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { assertRecordInScope, type MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { coveredInstallments } from "./totals.js";

export const quoteColumns = {
  id: true,
  leadId: true,
  title: true,
  startDate: true,
  adults: true,
  children: true,
  days: true,
  items: true,
  inclusions: true,
  exclusions: true,
  notes: true,
  taxRateBasisPoints: true,
  placeOfSupply: true,
  subtotalPaise: true,
  taxPaise: true,
  totalPaise: true,
  status: true,
  replacedById: true,
  acceptedAt: true,
  acceptedName: true,
  version: true,
  pdfDocumentId: true,
  pdfVersion: true,
  invoiceDocumentId: true,
  updatedAt: true,
  lead: { select: { ownerUserId: true, person: { select: { name: true, phoneE164: true, email: true } } } },
  payments: {
    where: { voidedAt: null },
    orderBy: { receivedOn: "asc" },
    select: {
      id: true,
      amountPaise: true,
      receivedOn: true,
      method: true,
      reference: true,
      recordedBy: true,
      receiptDocumentId: true,
    },
  },
  installments: {
    orderBy: { dueOn: "asc" },
    select: { id: true, label: true, amountPaise: true, dueOn: true },
  },
} as const;

type QuoteRow = NonNullable<Awaited<ReturnType<typeof findQuoteRow>>>;

const findQuoteRow = (tx: OrgTx, quoteId: string) =>
  tx.quote.findUnique({ where: { id: quoteId }, select: quoteColumns });

/** A day stored as a Date (Postgres date) as YYYY-MM-DD. */
export const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** The live quote, if the member may see its lead's quotes; NOT_FOUND otherwise, whatever the reason. */
export async function findQuoteInScope(tx: OrgTx, access: MemberAccess, quoteId: string): Promise<QuoteRow> {
  const row = await findQuoteRow(tx, quoteId);
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such quote");
  assertRecordInScope(access, "quotes:view", row.lead.ownerUserId);
  return row;
}

/**
 * The same, with the quote's row locked until the transaction ends: whatever changes it, numbers its documents or
 * records money on it waits its turn, so two taps (or two people) never both act on what the first already changed.
 */
export async function findQuoteForChange(tx: OrgTx, access: MemberAccess, quoteId: string): Promise<QuoteRow> {
  await tx.$queryRaw`SELECT id FROM quote WHERE id = ${quoteId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  return findQuoteInScope(tx, access, quoteId);
}

/** Only a draft is edited: once sent, a quote keeps its prices (spec 4.3); a new version replaces it. */
export function assertDraft(row: Pick<QuoteRow, "status">): void {
  if (row.status !== "draft") {
    throw new DomainError(
      "CONFLICT",
      "QUOTE_FROZEN",
      "A quote that was sent can't be changed; make a new version of it instead",
    );
  }
}

/** A quote by id for the system (the customer's link): no member's scope. */
export async function findQuoteForSystem(tx: OrgTx, quoteId: string): Promise<QuoteRow> {
  const row = await findQuoteRow(tx, quoteId);
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such quote");
  return row;
}

export const paidOf = (row: Pick<QuoteRow, "payments">) =>
  row.payments.reduce((total, payment) => total + Number(payment.amountPaise), 0);

const totalsOf = (row: QuoteRow) => {
  const paidPaise = paidOf(row);
  const totalPaise = Number(row.totalPaise);
  return {
    subtotalPaise: Number(row.subtotalPaise),
    taxPaise: Number(row.taxPaise),
    totalPaise,
    paidPaise,
    balancePaise: Math.max(0, totalPaise - paidPaise),
  };
};

export const daysOf = (row: Pick<QuoteRow, "days">) => quoteDay.array().catch([]).parse(row.days);
export const itemsOf = (row: Pick<QuoteRow, "items">) => quoteItem.array().catch([]).parse(row.items);

export function toSummary(row: QuoteRow): QuoteSummary {
  return quoteSummary.parse({
    id: row.id,
    leadId: row.leadId,
    customerName: row.lead.person.name,
    title: row.title,
    startDate: row.startDate === null ? null : dayOf(row.startDate),
    status: row.status,
    totals: totalsOf(row),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function toDetail(row: QuoteRow): QuoteDetail {
  const totals = totalsOf(row);
  return quoteDetail.parse({
    ...toSummary(row),
    days: daysOf(row),
    items: itemsOf(row),
    adults: row.adults,
    children: row.children,
    inclusions: row.inclusions,
    exclusions: row.exclusions,
    notes: row.notes,
    taxRateBasisPoints: row.taxRateBasisPoints,
    placeOfSupply: row.placeOfSupply,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedName: row.acceptedName,
    customerPhone: row.lead.person.phoneE164,
    invoiceDocumentId: row.invoiceDocumentId,
    replacedById: row.replacedById,
    installments: coveredInstallments(
      row.installments.map((due) => ({
        id: due.id,
        label: due.label,
        amountPaise: Number(due.amountPaise),
        dueOn: dayOf(due.dueOn),
      })),
      totals.paidPaise,
    ),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      amountPaise: Number(payment.amountPaise),
      receivedOn: dayOf(payment.receivedOn),
      method: payment.method,
      reference: payment.reference,
      recordedBy: payment.recordedBy,
      receiptDocumentId: payment.receiptDocumentId,
    })),
  });
}

/** What a new quote copied from this one starts with: everything a person wrote, for the same lead. */
export function copyOf(row: QuoteRow): CreateQuoteInput {
  return {
    leadId: row.leadId,
    title: row.title,
    startDate: row.startDate === null ? null : dayOf(row.startDate),
    adults: row.adults,
    children: row.children,
    days: daysOf(row),
    items: itemsOf(row),
    inclusions: row.inclusions,
    exclusions: row.exclusions,
    notes: row.notes,
    taxRateBasisPoints: quoteTaxRate.catch(500).parse(row.taxRateBasisPoints),
    placeOfSupply: createQuoteInput.shape.placeOfSupply.catch(null).parse(row.placeOfSupply),
  };
}
