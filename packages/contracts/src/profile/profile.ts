// An organization's business profile (spec 7.1): onboarding's GSTIN, state and contact, and the setup checklist's bank
// details, invoice prefix and branding. Each value is checked here as the database checks it.
import { z } from "zod";
import { personName } from "../identity/index.js";
import { gstStateCode, gstin, phoneNumber } from "../kernel/index.js";

/** Optional text: blank becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((text) => (text === "" ? null : text))
    .nullable();

/** Checked before upper-casing: Unicode case mapping turns some letters into ASCII capitals. */
const capitals = (pattern: RegExp, message: string) => z.string().trim().regex(pattern, message).toUpperCase();

/** 2-5 letters invoices are numbered with, e.g. "SH" for SH-2026-0042. */
export const invoicePrefix = capitals(/^[A-Za-z]{2,5}$/, "Use 2-5 letters");

/** An Indian bank branch's IFSC: four letters, a zero, six letters or digits. */
export const bankIfsc = capitals(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "Check the IFSC: 11 characters, the fifth a zero");

export const bankAccountNumber = z
  .string()
  .trim()
  .regex(/^[0-9]{9,18}$/, "Use the account's 9 to 18 digits");

/** The organization's own colour, "#rrggbb". */
export const brandColour = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Use a colour like #1f6f5c")
  .toLowerCase();

const profileFields = {
  legalName: z.string().trim().min(1).max(120),
  gstin: gstin.nullable(),
  gstStateCode,
  address: optionalText(500),
  contactName: personName.nullable(),
  contactPhone: phoneNumber.nullable(),
  bankAccountName: optionalText(120),
  bankAccountNumber: bankAccountNumber.nullable(),
  bankIfsc: bankIfsc.nullable(),
  bankName: optionalText(120),
  invoicePrefix: invoicePrefix.nullable(),
  brandColour: brandColour.nullable(),
  documentTerms: optionalText(2000),
};

/** The whole profile, saved at once. A GSTIN's first two digits are its state's code. */
export const saveOrganizationProfileInput = z
  .strictObject(profileFields)
  .refine((profile) => profile.gstin === null || profile.gstin.startsWith(profile.gstStateCode), {
    message: "The GSTIN belongs to another state",
    path: ["gstin"],
  });
export type SaveOrganizationProfileInput = z.infer<typeof saveOrganizationProfileInput>;

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

/** The setup checklist an Owner lands on after onboarding (spec 7.1), as far as the Foundation has its steps. */
export const setupStep = z.enum(["business-details", "bank-details", "invoice-prefix", "branding", "staff"]);
export type SetupStep = z.infer<typeof setupStep>;

export const setupChecklist = z.object({
  steps: z.array(z.object({ step: setupStep, done: z.boolean() })),
  done: z.boolean(),
});
export type SetupChecklist = z.infer<typeof setupChecklist>;
