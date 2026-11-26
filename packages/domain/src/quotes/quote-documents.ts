// A quote's numbered documents (step 3, P0), through the documents module: the quotation's PDF (QT-2026-0001, issued
// again only when the quote changed), its tax invoice once accepted (the agency's own prefix, or INV), and a receipt for
// each payment (RCT-). What is issued is frozen; the worker renders each PDF once. The branding is the caller's.
import {
  DEFAULT_INVOICE_PREFIX,
  QUOTE_DOCUMENT_PREFIX,
  RECEIPT_DOCUMENT_PREFIX,
  type IssueDocumentInput,
  type IssueQuotationInput,
} from "@travel-crm/contracts/documents";
import { upiPayeeName, upiPayLink, type QuoteSettings } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { issueDocument, unchangedDocument } from "../documents/index.js";
import type { MemberAccess } from "../identity/index.js";
import {
  DomainError,
  formatMoney,
  formatRupees,
  formatDayWithYear,
  money,
  parseCalendarDate,
  type TaxComponent,
} from "../kernel/index.js";
import { gstLabel, wholeRupeePrice } from "./whole-rupees.js";
import { dayOf, daysOf, findQuoteForChange, findQuoteInScope, itemsOf, paidOf } from "./quote-rows.js";
import { quoteSettingsOf } from "./settings.js";
import { coveredInstallments, payDueNow, quoteMoney, TOUR_OPERATOR_SAC } from "./totals.js";

type Branding = IssueDocumentInput["branding"];

export interface DocumentContext {
  branding: Branding;
  supplierStateCode: string | null;
  gstin: string | null;
  invoicePrefix: string | null;
  now: Date;
}

type Quote = Awaited<ReturnType<typeof findQuoteInScope>>;

const rupees = (paise: number) => formatMoney(money(paise));
const cut = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 3)}...`);
const taxLabel = (component: TaxComponent) => `${component.name} ${String(component.rateBasisPoints / 100)} %`;

function recipientOf(quote: Quote) {
  const { person } = quote.lead;
  return {
    name: cut(person.name, 120),
    lines: [person.phoneE164, person.email].filter((line): line is string => line !== null && line !== "").slice(0, 6),
  };
}

function priceRows(quote: Quote) {
  const rows = itemsOf(quote).map((item) => ({
    description: cut(item.description, 500),
    detail: cut(
      [item.detail, `${String(item.quantity)} x ${rupees(item.unitPricePaise)}`].filter(Boolean).join(" · "),
      300,
    ),
    amount: rupees(item.unitPricePaise * item.quantity),
  }));
  return rows.length > 0 ? rows : [{ description: cut(quote.title, 500), amount: rupees(Number(quote.subtotalPaise)) }];
}

function moneyTotals(quote: Quote, context: DocumentContext) {
  const worked = quoteMoney(
    itemsOf(quote),
    quote.taxRateBasisPoints,
    // The state the agency had when it sent the quote, not the one it has now.
    quote.supplierStateCode ?? context.supplierStateCode ?? "",
    quote.placeOfSupply,
  );
  return [
    { label: "Taxable value", amount: rupees(worked.subtotalPaise) },
    ...worked.components.map((component) => ({
      label: taxLabel(component),
      amount: rupees(component.amount.amountPaise),
    })),
    { label: "Total", amount: rupees(worked.totalPaise), emphasis: true },
  ];
}

/** A free-text list as its points, one per line, without a typed bullet (as the customer's page shows it). */
const pointsOf = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/^\s*[-•*✓✗]\s*/, "").trim())
    .filter((line) => line !== "");

/** "1 adult, 2 children". */
function travellersOf(quote: Quote): string {
  return [
    quote.adults > 0 ? `${String(quote.adults)} adult${quote.adults === 1 ? "" : "s"}` : "",
    quote.children > 0 ? `${String(quote.children)} child${quote.children === 1 ? "" : "ren"}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * The quotation in the words its PDF prints, matching the customer's page: whole rupees, dates as words. Nothing is cut
 * short: the contract's caps are the quote's own limits, so a quote that saves always issues.
 */
function quotationContent(quote: Quote, settings: QuoteSettings) {
  const day = (date: Date, weekday: boolean) => formatDayWithYear(parseCalendarDate(dayOf(date)), { weekday });
  const when = [quote.startDate === null ? "" : day(quote.startDate, true), travellersOf(quote)]
    .filter(Boolean)
    .join(" · ");
  const items = itemsOf(quote);
  const price = wholeRupeePrice(
    items.map((item) => item.unitPricePaise * item.quantity),
    Number(quote.totalPaise),
    Number(quote.taxPaise),
  );
  const paidPaise = paidOf(quote);
  const installments = coveredInstallments(
    quote.installments.map((due) => ({
      label: due.label,
      amountPaise: Number(due.amountPaise),
      dueOn: dayOf(due.dueOn),
    })),
    paidPaise,
  );
  const dueNow = payDueNow(installments, paidPaise, Math.max(0, Number(quote.totalPaise) - paidPaise));
  // The same link the customer's button opens, so the QR and the button agree.
  const link = upiPayLink(settings, { amountPaise: dueNow, note: quote.title });
  return {
    title: quote.title,
    customer: quote.lead.person.name,
    ...(link === null
      ? {}
      : {
          pay: {
            // The QR only once the agency has verified it; the id, name and amount print either way.
            ...(settings.upiVerifiedAt === null ? {} : { link }),
            upiId: settings.upiId,
            name: upiPayeeName(settings),
            amount: formatRupees(dueNow),
          },
        }),
    ...(when === "" ? {} : { when }),
    lines: items.map((item, index) => ({
      description: `${item.description} × ${String(item.quantity)}`,
      ...(item.detail === "" ? {} : { detail: item.detail }),
      amount: formatRupees(price.linesPaise[index] ?? 0),
    })),
    ...(price.gstPaise === null
      ? {}
      : { gst: { label: gstLabel(quote.taxRateBasisPoints), amount: formatRupees(price.gstPaise) } }),
    total: formatRupees(Number(quote.totalPaise)),
    ...(price.gstPaise === null ? {} : { totalNote: `incl. ${String(quote.taxRateBasisPoints / 100)}% GST` }),
    dues: installments.map((due) => ({
      label: due.label,
      by: formatDayWithYear(parseCalendarDate(due.dueOn), { weekday: false }),
      amount: formatRupees(due.amountPaise),
      ...(due.paid ? { paid: true as const } : {}),
    })),
    days: daysOf(quote).map((planned) => ({
      title: planned.title,
      ...(planned.description.trim() === "" ? {} : { description: planned.description.trim() }),
    })),
    inclusions: pointsOf(quote.inclusions),
    exclusions: pointsOf(quote.exclusions),
    notes: pointsOf(quote.notes),
  };
}

async function issue(
  tx: OrgTx,
  access: MemberAccess,
  input: IssueDocumentInput | IssueQuotationInput,
  prefix: string,
  now: Date,
) {
  const document = await issueDocument(tx, access, { ...input, prefix }, now);
  return { documentId: document.id, number: document.number };
}

/**
 * The quotation's PDF as the quote stands; the one issued before while it prints the same. A payment, a void, a change to
 * the dues, the UPI id or the terms changes what it prints (without changing the quote's version), so it is issued anew.
 */
export async function issueQuotePdf(tx: OrgTx, access: MemberAccess, quoteId: string, context: DocumentContext) {
  const quote = await findQuoteForChange(tx, access, quoteId);
  const input = {
    template: "quotation" as const,
    content: quotationContent(quote, await quoteSettingsOf(tx)),
    branding: context.branding,
  };
  const kept = quote.pdfDocumentId === null ? null : await unchangedDocument(tx, quote.pdfDocumentId, input);
  if (kept !== null) return kept;
  const issued = await issue(tx, access, input, QUOTE_DOCUMENT_PREFIX, context.now);
  await tx.quote.update({
    where: { id: quote.id },
    data: { pdfDocumentId: issued.documentId, pdfVersion: quote.version },
  });
  return issued;
}

/** The tax invoice of an accepted quote, issued once: a second call gives the same one. */
export async function issueQuoteInvoice(tx: OrgTx, access: MemberAccess, quoteId: string, context: DocumentContext) {
  // The quote's row is locked, so a second tap waits and then finds the invoice the first one issued.
  const quote = await findQuoteForChange(tx, access, quoteId);
  if (quote.invoiceDocumentId !== null) {
    const kept = await tx.issuedDocument.findUniqueOrThrow({
      where: { id: quote.invoiceDocumentId },
      select: { number: true },
    });
    return { documentId: quote.invoiceDocumentId, number: kept.number };
  }
  if (quote.status !== "accepted") {
    throw new DomainError("CONFLICT", "QUOTE_NOT_ACCEPTED", "Only an accepted quote is invoiced");
  }
  // A taxed invoice is the agency's own tax document: it needs its GSTIN (and its GST state, which the totals check).
  if (Number(quote.taxPaise) > 0 && (context.gstin === null || context.gstin === "")) {
    throw new DomainError(
      "CONFLICT",
      "GSTIN_REQUIRED",
      "Save your GSTIN in the business details before you issue an invoice with tax",
    );
  }
  const paid = paidOf(quote);
  const total = Number(quote.totalPaise);
  const notes = [
    context.gstin === null ? "" : `GSTIN ${context.gstin}`,
    `SAC ${TOUR_OPERATOR_SAC} (tour operator services)`,
    quote.placeOfSupply === null
      ? ""
      : `Place of supply: ${quote.placeOfSupply === "OUTSIDE_INDIA" ? "Outside India" : quote.placeOfSupply}`,
  ].filter((line) => line !== "");
  const issued = await issue(
    tx,
    access,
    {
      template: "sample",
      content: {
        title: context.gstin === null || context.gstin === "" ? "Invoice" : "Tax invoice",
        recipient: recipientOf(quote),
        rows: priceRows(quote),
        totals: [
          ...moneyTotals(quote, context),
          { label: "Paid", amount: rupees(paid) },
          { label: "Balance due", amount: rupees(Math.max(0, total - paid)) },
        ],
        notes: notes.join("\n"),
      },
      branding: context.branding,
    },
    context.invoicePrefix ?? DEFAULT_INVOICE_PREFIX,
    context.now,
  );
  await tx.quote.update({ where: { id: quote.id }, data: { invoiceDocumentId: issued.documentId } });
  return issued;
}

const methodWords: Record<string, string> = {
  upi: "UPI",
  bank: "Bank transfer",
  cash: "Cash",
  card: "Card",
  other: "Other",
};

/** A payment's receipt, issued once. */
export async function issuePaymentReceipt(
  tx: OrgTx,
  access: MemberAccess,
  paymentId: string,
  context: DocumentContext,
) {
  const payment = await tx.quotePayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      quoteId: true,
      amountPaise: true,
      receivedOn: true,
      method: true,
      reference: true,
      voidedAt: true,
      receiptDocumentId: true,
    },
  });
  if (payment === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  const quote = await findQuoteForChange(tx, access, payment.quoteId);
  // Read again under the lock: a void or another receipt that was ahead of this tap has changed the payment.
  const current = await tx.quotePayment.findUniqueOrThrow({
    where: { id: payment.id },
    select: { voidedAt: true, receiptDocumentId: true },
  });
  if (current.voidedAt !== null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  if (current.receiptDocumentId !== null) {
    const kept = await tx.issuedDocument.findUniqueOrThrow({
      where: { id: current.receiptDocumentId },
      select: { number: true },
    });
    return { documentId: current.receiptDocumentId, number: kept.number };
  }
  const paid = paidOf(quote);
  const total = Number(quote.totalPaise);
  const issued = await issue(
    tx,
    access,
    {
      template: "sample",
      content: {
        title: "Payment receipt",
        recipient: recipientOf(quote),
        rows: [
          {
            description: cut(`Received for ${quote.title}`, 500),
            detail: cut(
              [methodWords[payment.method] ?? payment.method, dayOf(payment.receivedOn), payment.reference]
                .filter((part) => part !== "")
                .join(" · "),
              300,
            ),
            amount: rupees(Number(payment.amountPaise)),
          },
        ],
        totals: [
          { label: "Quote total", amount: rupees(total) },
          { label: "Paid to date", amount: rupees(paid) },
          { label: "Balance due", amount: rupees(Math.max(0, total - paid)), emphasis: true },
        ],
      },
      branding: context.branding,
    },
    RECEIPT_DOCUMENT_PREFIX,
    context.now,
  );
  await tx.quotePayment.update({ where: { id: payment.id }, data: { receiptDocumentId: issued.documentId } });
  return issued;
}

/** Whether a document is one of this quote's (its PDF, invoice or a receipt), for the member downloading it. */
export async function assertQuoteDocument(tx: OrgTx, access: MemberAccess, quoteId: string, documentId: string) {
  const quote = await findQuoteInScope(tx, access, quoteId);
  const receipts = await tx.quotePayment.findMany({
    where: { quoteId: quote.id },
    select: { receiptDocumentId: true },
  });
  const ours = [quote.pdfDocumentId, quote.invoiceDocumentId, ...receipts.map((receipt) => receipt.receiptDocumentId)];
  if (!ours.includes(documentId)) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
}
