// The console's invoices (super admins only): the firm's billing details, and invoices made by hand, numbered and frozen.
import { z } from "zod";
import { emailAddress, recordId } from "../identity/index.js";
import { presignedUpload } from "../files/attachments.js";
import { calendarDate, gstin, gstStateCode, phoneNumber } from "../kernel/index.js";

/** The GST rates an invoice may charge, in hundredths of a percent: 0, 5, 12, 18 and 28 %. */
export const invoiceGstRates = [0, 500, 1200, 1800, 2800] as const;
export const invoiceGstRate = z.union([
  z.literal(0),
  z.literal(500),
  z.literal(1200),
  z.literal(1800),
  z.literal(2800),
]);

export const invoiceKind = z.enum(["proforma", "invoice"]);
export type InvoiceKind = z.infer<typeof invoiceKind>;

export const invoiceStatus = z.enum(["issued", "cancelled"]);

/** The most one line may charge: ₹10 crore, in paise. Far above any plan, far below what overflows a sum. */
export const MAX_INVOICE_LINE_PAISE = 1_000_000_000;

/** The largest logo or signature image: 1 MB. */
export const MAX_BILLING_IMAGE_BYTES = 1_048_576;

/** The most one line's quantity may be. */
export const MAX_INVOICE_QUANTITY = 999;

/** Free text that may be left empty: empty or absent both mean "not given". */
const optionalText = (max: number) => z.string().trim().max(max).optional();

const numberPrefix = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{1,8}$/, "Use up to 8 capital letters, digits or dashes");

export const billingDetails = z.object({
  legalName: z.string(),
  address: z.string(),
  stateCode: z.string(),
  pan: z.string().nullable(),
  gstin: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  bankAccountName: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  bankIfsc: z.string().nullable(),
  bankNameBranch: z.string().nullable(),
  upiId: z.string().nullable(),
  defaultTerms: z.string().nullable(),
  /** Storage keys of the images, under "platform/billing/"; null when none. */
  logoKey: z.string().nullable(),
  signatureKey: z.string().nullable(),
  signatoryName: z.string().nullable(),
  signatoryTitle: z.string().nullable(),
  proformaPrefix: z.string(),
  invoicePrefix: z.string(),
});
export type BillingDetails = z.infer<typeof billingDetails>;

export const setBillingDetailsInput = z
  .strictObject({
    legalName: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(500),
    stateCode: gstStateCode,
    pan: optionalText(10),
    gstin: gstin.optional(),
    phone: phoneNumber.optional(),
    email: emailAddress.optional(),
    bankAccountName: optionalText(120),
    bankAccountNumber: optionalText(30),
    bankIfsc: optionalText(15),
    bankNameBranch: optionalText(120),
    upiId: optionalText(80),
    defaultTerms: optionalText(1000),
    /** A key from `billingImageUploadLink`; null or absent: no image (every save sends the whole picture). */
    logoKey: z.string().max(200).nullish(),
    signatureKey: z.string().max(200).nullish(),
    signatoryName: optionalText(80),
    signatoryTitle: optionalText(40),
    proformaPrefix: numberPrefix,
    invoicePrefix: numberPrefix,
  })
  .refine((input) => input.proformaPrefix !== input.invoicePrefix, {
    // The two kinds count on their own, and a number is unique across both: equal prefixes would repeat one.
    path: ["invoicePrefix"],
    message: "The two prefixes must differ",
  });
export type SetBillingDetailsInput = z.infer<typeof setBillingDetailsInput>;

export const billingImageKind = z.enum(["logo", "signature"]);
export type BillingImageKind = z.infer<typeof billingImageKind>;

export const billingImageContentType = z.enum(["image/png", "image/jpeg"]);

export const billingImageUploadLinkInput = z.strictObject({
  kind: billingImageKind,
  contentType: billingImageContentType,
  sizeBytes: z.int().min(1).max(MAX_BILLING_IMAGE_BYTES),
});
export type BillingImageUploadLinkInput = z.infer<typeof billingImageUploadLinkInput>;

/** Where the browser PUTs the image, and the key to save on the billing details once it has. */
export const billingImageUploadLink = presignedUpload.extend({ key: z.string() });
export type BillingImageUploadLink = z.infer<typeof billingImageUploadLink>;

export const billingImageLinkInput = z.strictObject({ kind: billingImageKind });

/** A line: what, how many and at what rate; its amount is quantity × rate, which may not pass the per-line cap. */
export const invoiceLine = z
  .strictObject({
    description: z.string().trim().min(1).max(200),
    quantity: z.int().min(1).max(MAX_INVOICE_QUANTITY),
    ratePaise: z.int().min(1).max(MAX_INVOICE_LINE_PAISE),
  })
  .refine((line) => line.quantity * line.ratePaise <= MAX_INVOICE_LINE_PAISE, {
    path: ["ratePaise"],
    message: "A line's amount can't pass ₹10 crore",
  });

/** A line as stored: invoices made before quantities hold only a description and an amount. */
export const storedInvoiceLine = z.object({
  description: z.string(),
  amountPaise: z.int(),
  quantity: z.int().min(1).optional(),
  ratePaise: z.int().optional(),
});

export const createInvoiceInput = z
  .strictObject({
    kind: invoiceKind,
    issuedOn: calendarDate,
    dueOn: calendarDate.optional(),
    billTo: z.strictObject({
      name: z.string().trim().min(1).max(120),
      address: optionalText(500),
      stateCode: gstStateCode.optional(),
      gstin: gstin.optional(),
    }),
    lines: z.array(invoiceLine).min(1).max(20),
    gstRateBasisPoints: invoiceGstRate,
    notes: optionalText(1000),
  })
  .refine((input) => input.dueOn === undefined || input.dueOn >= input.issuedOn, {
    path: ["dueOn"],
    message: "The due date can't be before the invoice date",
  });
export type CreateInvoiceInput = z.infer<typeof createInvoiceInput>;

export const invoiceSummary = z.object({
  id: recordId,
  kind: invoiceKind,
  number: z.string(),
  issuedOn: z.string(),
  billToName: z.string(),
  totalPaise: z.int(),
  status: invoiceStatus,
  createdAt: z.iso.datetime(),
});
export type InvoiceSummary = z.infer<typeof invoiceSummary>;

export const invoiceDetail = invoiceSummary.extend({
  financialYear: z.string(),
  sequence: z.int(),
  dueOn: z.string().nullable(),
  billToAddress: z.string().nullable(),
  billToStateCode: z.string().nullable(),
  billToGstin: z.string().nullable(),
  /** Each line as it was made; one made before quantities (no quantity stored) reads as 1 at its amount. */
  lines: z.array(z.object({ description: z.string(), quantity: z.int(), ratePaise: z.int(), amountPaise: z.int() })),
  gstRateBasisPoints: z.int(),
  subtotalPaise: z.int(),
  cgstPaise: z.int(),
  sgstPaise: z.int(),
  igstPaise: z.int(),
  notes: z.string().nullable(),
  /** The billing details the invoice was made with, as they were then. */
  seller: billingDetails,
  cancelledAt: z.iso.datetime().nullable(),
  cancelReason: z.string().nullable(),
  createdBy: recordId,
});
export type InvoiceDetail = z.infer<typeof invoiceDetail>;

export const invoiceIdInput = z.strictObject({ invoiceId: recordId });

export const cancelInvoiceInput = z.strictObject({
  invoiceId: recordId,
  reason: z.string().trim().min(1).max(500),
});
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceInput>;

export const listInvoicesInput = z.strictObject({
  /** The id of the last invoice of the previous page. */
  before: recordId.optional(),
  limit: z.int().min(1).max(100).default(50),
});
export type ListInvoicesInput = z.infer<typeof listInvoicesInput>;

export const invoicePage = z.object({
  invoices: z.array(invoiceSummary),
  /** Pass as `before` for the next page; null on the last page. */
  nextCursor: recordId.nullable(),
});
export type InvoicePage = z.infer<typeof invoicePage>;

export const invoiceDownloadLink = z.object({ url: z.string() });
