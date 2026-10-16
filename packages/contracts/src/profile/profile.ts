// An organization's business profile (spec 7.1): onboarding's GSTIN, state and contact, and the setup checklist's bank
// details, invoice prefix and branding. Each value is checked here as the database checks it.
import { z } from "zod";
import { reservedDocumentPrefixes } from "../documents/index.js";
import { personName } from "../identity/index.js";
import { gstStateCode, gstin, phoneNumber } from "../kernel/index.js";

/**
 * The one rule for every optional text: a blank box is no value. A form posts "" for an empty field, so blank (or only
 * spaces) becomes null before the value's own rules run, and null stays null.
 */
const optional = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .nullable()
    .transform((text) => (text === null || text.trim() === "" ? null : text))
    .pipe(schema.nullable());

const optionalText = (max: number) => optional(z.string().trim().max(max));

/** Checked before upper-casing: Unicode case mapping turns some letters into ASCII capitals. */
const capitals = (pattern: RegExp, message: string) => z.string().trim().regex(pattern, message).toUpperCase();

/** 2-5 letters invoices are numbered with, e.g. "SH" for SH-2026-0042; never those of the platform's own documents. */
export const invoicePrefix = capitals(/^[A-Za-z]{2,5}$/, "Use 2-5 letters").refine(
  (prefix) => !reservedDocumentPrefixes.includes(prefix),
  "These letters number the app's own documents. Choose others",
);

/** An Indian bank branch's IFSC: four letters, a zero, six letters or digits. */
export const bankIfsc = capitals(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "Check the IFSC: 11 characters, the fifth a zero");

/** Cheques print account numbers in groups ("0012 3456 7890"), so spaces and hyphens are dropped before the check. */
export const bankAccountNumber = z
  .string()
  .transform((text) => text.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^[0-9]{9,18}$/, "Use the account's 9 to 18 digits"));

/** The organization's own colour, "#rrggbb". */
export const brandColour = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Use a colour like #1f6f5c")
  .toLowerCase();

/** The business details, saved from the profile screen. */
const businessFields = {
  legalName: z.string().trim().min(1).max(120),
  gstin: optional(gstin),
  gstStateCode,
  address: optionalText(500),
  contactName: optional(personName),
  contactPhone: optional(phoneNumber),
  bankAccountName: optionalText(120),
  bankAccountNumber: optional(bankAccountNumber),
  bankIfsc: optional(bankIfsc),
  bankName: optionalText(120),
  invoicePrefix: optional(invoicePrefix),
};

/** The look of the organization's documents, saved from the branding screen. The logo comes with uploads. */
const brandingFields = {
  brandColour: optional(brandColour),
  documentTerms: optionalText(2000),
};

/** A GSTIN's first two digits are its state's code. */
const gstinOfItsState = {
  check: (profile: { gstin: string | null; gstStateCode: string }) =>
    profile.gstin === null || profile.gstin.startsWith(profile.gstStateCode),
  params: { message: "The GSTIN belongs to another state", path: ["gstin"] },
};

/** The business details alone: what the Owner's profile screen sends. Branding is saved apart. */
export const updateOrganizationProfileInput = z
  .strictObject(businessFields)
  .refine(gstinOfItsState.check, gstinOfItsState.params);
export type UpdateOrganizationProfileInput = z.infer<typeof updateOrganizationProfileInput>;

/** The whole profile, saved at once (onboarding does). */
export const saveOrganizationProfileInput = z
  .strictObject({ ...businessFields, ...brandingFields })
  .refine(gstinOfItsState.check, gstinOfItsState.params);
export type SaveOrganizationProfileInput = z.infer<typeof saveOrganizationProfileInput>;

export const saveBrandingInput = z.strictObject(brandingFields);
export type SaveBrandingInput = z.infer<typeof saveBrandingInput>;

export const organizationProfileDetails = z.object({
  legalName: z.string(),
  gstin: z.string().nullable(),
  gstStateCode: z.string(),
  address: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  bankAccountName: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  bankIfsc: z.string().nullable(),
  bankName: z.string().nullable(),
  invoicePrefix: z.string().nullable(),
  brandColour: z.string().nullable(),
  documentTerms: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type OrganizationProfileDetails = z.infer<typeof organizationProfileDetails>;

/** What the profile screen shows: everything but the branding, which has its own screen. */
export const businessProfileDetails = organizationProfileDetails.omit({ brandColour: true, documentTerms: true });
export type BusinessProfileDetails = z.infer<typeof businessProfileDetails>;

/** What the branding screen shows. No bank details, so whoever may see branding never sees the account number. */
export const brandingDetails = organizationProfileDetails.pick({
  brandColour: true,
  documentTerms: true,
  updatedAt: true,
});
export type BrandingDetails = z.infer<typeof brandingDetails>;

/**
 * The setup checklist an Owner lands on after onboarding (spec 7.1), as far as the Foundation has its steps: in the
 * order they are taken, which is the order the checklist lists them.
 */
export const setupStep = z.enum([
  "business-details",
  "contact-phone",
  "logo",
  "branding",
  "bank-details",
  "invoice-prefix",
  "staff",
]);
export type SetupStep = z.infer<typeof setupStep>;

export const setupChecklist = z.object({
  steps: z.array(z.object({ step: setupStep, done: z.boolean() })),
  done: z.boolean(),
});
export type SetupChecklist = z.infer<typeof setupChecklist>;
