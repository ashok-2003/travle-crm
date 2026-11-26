// Invoices made by hand in the console: numbered, computed, rendered to a PDF and stored once, then frozen. A mistake is
// fixed by cancelling and making a new one. Super admins only; every change goes in the platform log.
import { gstStates, isGstStateCode } from "@travel-crm/contracts/kernel";
import {
  billingDetails as billingDetailsSchema,
  invoiceDetail as invoiceDetailSchema,
  type BillingDetails,
  type CancelInvoiceInput,
  type CreateInvoiceInput,
  type InvoiceDetail,
  type InvoicePage,
  type ListInvoicesInput,
} from "@travel-crm/contracts/platform";
import type { PlatformTx } from "@travel-crm/db/platform";
import type { PlatformInvoiceData } from "@travel-crm/integrations/pdf";
import { DomainError, formatDateTime, formatMoney, money, newUuidV7, rupeesInWords } from "../kernel/index.js";
import { readBillingDetails } from "./billing-details.js";
import { invoiceAmounts, type InvoiceAmounts } from "./invoice-amounts.js";
import { financialYearOf, invoiceNumber, takeNextSequence } from "./invoice-numbers.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

type InvoiceRow = NonNullable<Awaited<ReturnType<PlatformTx["platformInvoice"]["findUnique"]>>>;

/** A day as an invoice prints it: "26 Nov 2026". */
function printedDay(day: string): string {
  return formatDateTime(new Date(`${day}T00:00:00Z`), { timeZone: "UTC", style: "date" });
}

const dayOf = (date: Date): string => date.toISOString().slice(0, 10);
const rupees = (paise: number): string => formatMoney(money(paise));
const stateName = (code: string): string => gstStates.find((state) => state.code === code)?.name ?? code;

function toDetail(row: InvoiceRow): InvoiceDetail {
  return invoiceDetailSchema.parse({
    id: row.id,
    kind: row.kind,
    number: row.number,
    issuedOn: dayOf(row.issuedOn),
    billToName: row.billToName,
    totalPaise: Number(row.totalPaise),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    financialYear: row.financialYear,
    sequence: row.sequence,
    dueOn: row.dueOn === null ? null : dayOf(row.dueOn),
    billToAddress: row.billToAddress,
    billToStateCode: row.billToStateCode,
    billToGstin: row.billToGstin,
    lines: row.lines,
    gstRateBasisPoints: row.gstRateBasisPoints,
    subtotalPaise: Number(row.subtotalPaise),
    cgstPaise: Number(row.cgstPaise),
    sgstPaise: Number(row.sgstPaise),
    igstPaise: Number(row.igstPaise),
    notes: row.notes,
    seller: row.seller,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    createdBy: row.createdBy,
  });
}

const given = (value: string | undefined): string | null => (value === undefined || value === "" ? null : value);

/** What the PDF is given: every amount and date already as text, so the template knows no rules. */
function pdfData(
  input: CreateInvoiceInput,
  seller: BillingDetails,
  number: string,
  amounts: InvoiceAmounts,
): PlatformInvoiceData {
  const hasGst = input.gstRateBasisPoints > 0;
  const rate = (basisPoints: number) => `${String(basisPoints / 100)}%`;
  const sameState = input.billTo.stateCode === undefined || input.billTo.stateCode === seller.stateCode;
  const taxRows = !hasGst
    ? []
    : sameState
      ? [
          { label: `CGST ${rate(input.gstRateBasisPoints / 2)}`, amount: rupees(amounts.cgstPaise) },
          { label: `SGST ${rate(input.gstRateBasisPoints / 2)}`, amount: rupees(amounts.sgstPaise) },
        ]
      : [{ label: `IGST ${rate(input.gstRateBasisPoints)}`, amount: rupees(amounts.igstPaise) }];
  const sellerLines = [
    seller.address,
    seller.pan === null ? null : `PAN: ${seller.pan}`,
    seller.gstin === null ? null : `GSTIN: ${seller.gstin}`,
    seller.phone === null ? null : `Phone: ${seller.phone}`,
    seller.email === null ? null : `Email: ${seller.email}`,
  ];
  const billToLines = [
    given(input.billTo.address),
    input.billTo.stateCode === undefined ? null : `State: ${stateName(input.billTo.stateCode)}`,
    input.billTo.gstin === undefined ? null : `GSTIN: ${input.billTo.gstin}`,
  ];
  const paymentLines = [
    seller.bankAccountName === null ? null : `Account name: ${seller.bankAccountName}`,
    seller.bankAccountNumber === null ? null : `Account number: ${seller.bankAccountNumber}`,
    seller.bankIfsc === null ? null : `IFSC: ${seller.bankIfsc}`,
    seller.bankNameBranch === null ? null : `Bank: ${seller.bankNameBranch}`,
    seller.upiId === null ? null : `UPI: ${seller.upiId}`,
  ].filter((line) => line !== null);
  return {
    title: input.kind === "proforma" ? "Proforma Invoice" : hasGst ? "Tax Invoice" : "Invoice",
    number,
    issuedOn: printedDay(input.issuedOn),
    dueOn: input.dueOn === undefined ? undefined : printedDay(input.dueOn),
    seller: { name: seller.legalName, lines: sellerLines.filter((line) => line !== null) },
    billTo: { name: input.billTo.name, lines: billToLines.filter((line) => line !== null) },
    rows: input.lines.map((line) => ({ description: line.description, amount: rupees(line.amountPaise) })),
    totals: [
      { label: "Subtotal", amount: rupees(amounts.subtotalPaise) },
      ...taxRows,
      { label: "Total", amount: rupees(amounts.totalPaise), emphasis: true },
    ],
    totalInWords: rupeesInWords(amounts.totalPaise),
    payment: paymentLines.length === 0 ? null : { lines: paymentLines },
    notes: given(input.notes) ?? undefined,
    signatory: `For ${seller.legalName}`,
  };
}

/**
 * Makes one invoice in one platform transaction: the number, the amounts, the PDF in storage, the row and the log entry.
 * Anything that throws rolls the number back with the row (a stored file of a rolled-back create is never linked).
 */
export async function createInvoice(
  services: PlatformServices,
  staff: { userId: string },
  input: CreateInvoiceInput,
): Promise<InvoiceDetail> {
  const render = services.renderInvoice;
  if (render === undefined) {
    throw new DomainError("CONFLICT", "PDF_RENDERER_MISSING", "This server can't make invoice PDFs");
  }
  return services.platformDb.transaction(async (tx) => {
    const seller = await readBillingDetails(tx);
    if (seller === null) throw new DomainError("CONFLICT", "BILLING_DETAILS_MISSING", "Add billing details first");
    if (input.gstRateBasisPoints > 0) {
      if (seller.gstin === null) throw new DomainError("CONFLICT", "GST_NEEDS_GSTIN", "GST needs the firm's GSTIN");
      if (input.billTo.stateCode === undefined) {
        throw new DomainError("CONFLICT", "GST_NEEDS_STATE", "GST needs the billed company's state");
      }
    }
    if (!isGstStateCode(seller.stateCode)) throw new RangeError("The saved billing details have an unknown state");
    const financialYear = financialYearOf(input.issuedOn);
    const sequence = await takeNextSequence(tx, input.kind, financialYear);
    const prefix = input.kind === "proforma" ? seller.proformaPrefix : seller.invoicePrefix;
    const number = invoiceNumber(prefix, financialYear, sequence);
    const amounts = invoiceAmounts(
      input.lines,
      input.gstRateBasisPoints,
      seller.stateCode,
      input.billTo.stateCode ?? null,
    );
    const id = newUuidV7();
    const pdfKey = `platform/invoices/${financialYear}/${id}.pdf`;
    const pdf = await render(pdfData(input, seller, number, amounts), new Date());
    await services.storage.put({ key: pdfKey, contentType: "application/pdf", body: pdf });
    const row = await tx.platformInvoice.create({
      data: {
        id,
        kind: input.kind,
        number,
        financialYear,
        sequence,
        issuedOn: new Date(`${input.issuedOn}T00:00:00Z`),
        dueOn: input.dueOn === undefined ? null : new Date(`${input.dueOn}T00:00:00Z`),
        billToName: input.billTo.name,
        billToAddress: given(input.billTo.address),
        billToStateCode: input.billTo.stateCode ?? null,
        billToGstin: input.billTo.gstin ?? null,
        lines: input.lines,
        gstRateBasisPoints: input.gstRateBasisPoints,
        subtotalPaise: amounts.subtotalPaise,
        cgstPaise: amounts.cgstPaise,
        sgstPaise: amounts.sgstPaise,
        igstPaise: amounts.igstPaise,
        totalPaise: amounts.totalPaise,
        notes: given(input.notes),
        seller: billingDetailsSchema.parse(seller),
        pdfKey,
        createdBy: staff.userId,
      },
    });
    await recordPlatformAudit(tx, staff, {
      action: "invoice.created",
      targetType: "invoice",
      targetId: id,
      after: { number, kind: input.kind, billToName: input.billTo.name, totalPaise: amounts.totalPaise },
    });
    return toDetail(row);
  });
}

/** Invoices newest first, a page at a time. */
export async function listInvoices(services: PlatformServices, input: ListInvoicesInput): Promise<InvoicePage> {
  const rows = await services.platformDb.transaction((tx) =>
    tx.platformInvoice.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.before ? { cursor: { id: input.before }, skip: 1 } : {}),
      take: input.limit + 1,
    }),
  );
  const page = rows.slice(0, input.limit);
  return {
    invoices: page.map((row) => {
      const { id, kind, number, issuedOn, billToName, totalPaise, status, createdAt } = toDetail(row);
      return { id, kind, number, issuedOn, billToName, totalPaise, status, createdAt };
    }),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

async function findInvoice(tx: PlatformTx, invoiceId: string): Promise<InvoiceRow> {
  const row = await tx.platformInvoice.findUnique({ where: { id: invoiceId } });
  if (row === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such invoice");
  return row;
}

export function getInvoice(services: PlatformServices, invoiceId: string): Promise<InvoiceDetail> {
  return services.platformDb.transaction(async (tx) => toDetail(await findInvoice(tx, invoiceId)));
}

/** Cancels an issued invoice, with a reason. It stays in the list, and its number is never given again. */
export async function cancelInvoice(
  services: PlatformServices,
  staff: { userId: string },
  input: CancelInvoiceInput,
): Promise<InvoiceDetail> {
  return services.platformDb.transaction(async (tx) => {
    const current = await findInvoice(tx, input.invoiceId);
    if (current.status === "cancelled") {
      throw new DomainError("CONFLICT", "ALREADY_CANCELLED", "This invoice is already cancelled");
    }
    const row = await tx.platformInvoice.update({
      where: { id: input.invoiceId },
      data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: staff.userId, cancelReason: input.reason },
    });
    await recordPlatformAudit(tx, staff, {
      action: "invoice.cancelled",
      targetType: "invoice",
      targetId: row.id,
      before: { status: "issued" },
      after: { status: "cancelled", number: row.number, reason: input.reason },
    });
    return toDetail(row);
  });
}

/** A short-lived link to the frozen PDF. */
export async function invoiceDownloadLink(services: PlatformServices, invoiceId: string): Promise<{ url: string }> {
  const row = await services.platformDb.transaction((tx) => findInvoice(tx, invoiceId));
  const url = await services.storage.presignDownload(
    { key: row.pdfKey, fileName: `${row.number.replaceAll("/", "-")}.pdf`, contentType: "application/pdf" },
    300,
  );
  return { url };
}
