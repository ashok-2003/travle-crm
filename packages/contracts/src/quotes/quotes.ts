// Quotes (step 3, P0): a lead's quotation with its day-by-day plan and priced lines, GST worked out on the total, a link
// the customer opens and accepts, the payments due on it and those received (UPI, cash, bank), and its invoice and
// receipts as numbered PDFs. Amounts are integer paise, never floats.
import { z } from "zod";
import { aiFillUse } from "../ai/fill-use.js";
import { recordId } from "../identity/fields.js";
import { calendarDate, gstStateCode } from "../kernel/index.js";

/** ₹10 crore in paise: far above any one trip, well inside a JavaScript integer. */
export const MAX_QUOTE_PAISE = 10_000_000_000;
const paise = z.int().min(0).max(MAX_QUOTE_PAISE);
const positivePaise = z.int().min(1).max(MAX_QUOTE_PAISE);

export const MAX_QUOTE_DAYS = 60;
export const MAX_QUOTE_ITEMS = 50;
export const MAX_INSTALLMENTS = 12;

/** The GST rates a quote is taxed at, in basis points: none, 5 % (tour operator, no input credit), 18 % (with it). */
export const quoteTaxRates = [0, 500, 1800] as const;
export const quoteTaxRate = z.union([z.literal(0), z.literal(500), z.literal(1800)]);

/** "replaced": a sent quote the agency made a new version of; its link says so. */
export const quoteStatuses = ["draft", "sent", "accepted", "declined", "replaced"] as const;
export const quoteStatus = z.enum(quoteStatuses);
export type QuoteStatus = z.infer<typeof quoteStatus>;

export const paymentMethods = ["upi", "bank", "cash", "card", "other"] as const;
export const paymentMethod = z.enum(paymentMethods);
export type PaymentMethod = z.infer<typeof paymentMethod>;

const text = (max: number) => z.string().trim().max(max);

export const quoteDay = z.strictObject({ title: text(120).min(1), description: text(2000) });
export type QuoteDay = z.infer<typeof quoteDay>;

export const quoteItem = z.strictObject({
  description: text(200).min(1),
  detail: text(200),
  quantity: z.int().min(1).max(1000),
  unitPricePaise: paise,
});
export type QuoteItem = z.infer<typeof quoteItem>;

/** What a person writes on a quote. Totals are the server's. */
export const quoteFields = {
  title: text(120).min(1),
  startDate: calendarDate.nullable(),
  adults: z.int().min(0).max(500),
  children: z.int().min(0).max(500),
  days: z.array(quoteDay).max(MAX_QUOTE_DAYS),
  items: z.array(quoteItem).max(MAX_QUOTE_ITEMS),
  inclusions: text(3000),
  exclusions: text(3000),
  notes: text(3000),
  taxRateBasisPoints: quoteTaxRate,
  /** Where the trip is supplied for GST (the customer's state); null is the agency's own state. */
  placeOfSupply: z.union([gstStateCode, z.literal("OUTSIDE_INDIA")]).nullable(),
};

export const createQuoteInput = z.strictObject({ leadId: recordId, ...quoteFields });
export type CreateQuoteInput = z.infer<typeof createQuoteInput>;
export const updateQuoteInput = z.strictObject({ quoteId: recordId, ...quoteFields, aiFill: aiFillUse.optional() });
export type UpdateQuoteInput = z.infer<typeof updateQuoteInput>;
export const quoteIdInput = z.strictObject({ quoteId: recordId });
export type QuoteIdInput = z.infer<typeof quoteIdInput>;
export const leadQuotesInput = z.strictObject({ leadId: recordId });
export const setQuoteStatusInput = z.strictObject({
  quoteId: recordId,
  status: z.enum(["sent", "accepted", "declined"]),
});
export type SetQuoteStatusInput = z.infer<typeof setQuoteStatusInput>;

export const listQuotesInput = z.strictObject({
  status: quoteStatus.optional(),
  /** Only quotes with money still to come. */
  balanceDue: z.boolean().optional(),
});
export type ListQuotesInput = z.infer<typeof listQuotesInput>;

export const addInstallmentInput = z.strictObject({
  quoteId: recordId,
  label: text(80).min(1),
  amountPaise: positivePaise,
  dueOn: calendarDate,
});
export type AddInstallmentInput = z.infer<typeof addInstallmentInput>;
export const installmentIdInput = z.strictObject({ installmentId: recordId });

export const recordPaymentInput = z.strictObject({
  quoteId: recordId,
  amountPaise: positivePaise,
  receivedOn: calendarDate,
  method: paymentMethod,
  reference: text(80),
  /** Made once when the form opens, so a double tap or a retry records the payment once. */
  requestId: z.uuid(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentInput>;
export const paymentIdInput = z.strictObject({ paymentId: recordId });

export const quoteSettingsFields = {
  /** The agency's UPI id customers pay to, e.g. "sharmaholidays@okhdfcbank". Money goes to the agency, never us. */
  upiId: z
    .string()
    .trim()
    .max(100)
    .refine(
      (value) => value === "" || /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(value),
      "Use a UPI id like name@bank",
    ),
  /** The name the UPI app shows the customer. */
  upiName: text(100),
  /** The tax most of the agency's quotes use. */
  defaultTaxRateBasisPoints: quoteTaxRate,
  /** Printed under every quote: payment and cancellation terms. */
  defaultTerms: text(3000),
};
export const saveQuoteSettingsInput = z.strictObject(quoteSettingsFields);
export type SaveQuoteSettingsInput = z.infer<typeof saveQuoteSettingsInput>;
export const quoteSettings = z.object({
  upiId: z.string(),
  upiName: z.string(),
  defaultTaxRateBasisPoints: quoteTaxRate,
  defaultTerms: z.string(),
});
export type QuoteSettings = z.infer<typeof quoteSettings>;

/** The money on a quote, worked out by the server. */
export const quoteTotals = z.object({
  subtotalPaise: z.int(),
  taxPaise: z.int(),
  totalPaise: z.int(),
  paidPaise: z.int(),
  balancePaise: z.int(),
});
export type QuoteTotals = z.infer<typeof quoteTotals>;

export const installment = z.object({
  id: recordId,
  label: z.string(),
  amountPaise: z.int(),
  dueOn: calendarDate,
  /** Covered by what was paid, in due order. */
  paid: z.boolean(),
});
export type Installment = z.infer<typeof installment>;

export const payment = z.object({
  id: recordId,
  amountPaise: z.int(),
  receivedOn: calendarDate,
  method: paymentMethod,
  reference: z.string(),
  recordedBy: recordId.nullable(),
  receiptDocumentId: recordId.nullable(),
});
export type Payment = z.infer<typeof payment>;

export const quoteSummary = z.object({
  id: recordId,
  leadId: recordId,
  customerName: z.string(),
  title: z.string(),
  startDate: calendarDate.nullable(),
  status: quoteStatus,
  totals: quoteTotals,
  updatedAt: z.iso.datetime(),
});
export type QuoteSummary = z.infer<typeof quoteSummary>;
export const quoteList = z.array(quoteSummary);

export const quoteDetail = z.object({
  ...quoteSummary.shape,
  ...z.object(quoteFields).shape,
  startDate: calendarDate.nullable(),
  acceptedAt: z.iso.datetime().nullable(),
  /** The name the customer typed when accepting on the link. */
  acceptedName: z.string().nullable(),
  /** The customer's phone (E.164), to send the link on WhatsApp. */
  customerPhone: z.string().nullable(),
  invoiceDocumentId: recordId.nullable(),
  /** The draft that took this quote's place, when it was replaced. */
  replacedById: recordId.nullable(),
  installments: z.array(installment),
  payments: z.array(payment),
});
export type QuoteDetail = z.infer<typeof quoteDetail>;

export const quoteLink = z.object({ path: z.string() });
export const quoteDocument = z.object({ documentId: recordId, number: z.string() });

/** The money across the agency's (or the member's) quotes, for the dashboard. */
export const moneySummaryInput = z.strictObject({ from: calendarDate, to: calendarDate });
export const moneySummary = z.object({
  /** Quotes accepted in the period, and what they are worth. */
  acceptedCount: z.int(),
  acceptedPaise: z.int(),
  /** Payments received in the period. */
  receivedPaise: z.int(),
  /** What accepted quotes still have to be paid, now. */
  outstandingPaise: z.int(),
  /** Payments due by today and not yet covered, now. */
  overduePaise: z.int(),
  overdueCount: z.int(),
});
export type MoneySummary = z.infer<typeof moneySummary>;

/** A ready package ("Manali 5 days") a quote starts from in one tap: its plan and its price, saved from a quote. */
export const quotePackage = z.object({
  id: recordId,
  name: z.string(),
  title: z.string(),
  days: z.int(),
  /** Its lines' total before GST. */
  subtotalPaise: z.int(),
  taxRateBasisPoints: quoteTaxRate,
});
export type QuotePackage = z.infer<typeof quotePackage>;
export const quotePackageList = z.array(quotePackage);
export const savePackageInput = z.strictObject({ quoteId: recordId, name: text(80).min(1) });
export type SavePackageInput = z.infer<typeof savePackageInput>;
export const packageIdInput = z.strictObject({ packageId: recordId });
export const quoteFromPackageInput = z.strictObject({ leadId: recordId, packageId: recordId });
export type QuoteFromPackageInput = z.infer<typeof quoteFromPackageInput>;

/** The payload of "quote.accepted": ids only. `confirmed` is true when staff recorded money on the quote (it is a sale already). */
export const quoteAcceptedEvent = z.strictObject({ quoteId: recordId, leadId: recordId, confirmed: z.boolean() });
export type QuoteAcceptedEvent = z.infer<typeof quoteAcceptedEvent>;

/** The payload of "quote.reverted": the first payment that made a sent quote a sale was voided, so it is sent again. */
export const quoteRevertedEvent = z.strictObject({ quoteId: recordId });
export type QuoteRevertedEvent = z.infer<typeof quoteRevertedEvent>;
