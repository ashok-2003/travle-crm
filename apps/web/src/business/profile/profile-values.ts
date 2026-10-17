// The business profile form's values, as text, and the api's input made from them. The api's own schema
// (updateOrganizationProfileInput) decides what is valid; each problem is named by the field it belongs to, so the
// form shows its message there. A GSTIN that is well formed but another state's is told apart from a mistyped one, and
// an invoice prefix of well-formed letters that the app's own documents are numbered with (SMPL) from a mistyped one.
import { reservedDocumentPrefixes } from "@travel-crm/contracts/documents";
import { gstStates, gstStateCodeFromGstin, isValidGstin } from "@travel-crm/contracts/kernel";
import {
  updateOrganizationProfileInput,
  type BusinessProfileDetails,
  type UpdateOrganizationProfileInput,
} from "@travel-crm/contracts/profile";
import { phoneAsTyped } from "@/components/forms/phone-field";

export type ProfileField = keyof UpdateOrganizationProfileInput;

/** Every box of the form, as typed. A blank box is no value: the api's schema turns "" into null. */
export type ProfileValues = Record<ProfileField, string>;

/**
 * Message keys in "business.profile.problems": the field's own, a GSTIN of another state than the one chosen, or an
 * invoice prefix kept for the app's own documents.
 */
export type ProfileProblem = ProfileField | "gstinOfAnotherState" | "invoicePrefixReserved";

const FIELDS: readonly ProfileField[] = [
  "legalName",
  "gstin",
  "gstStateCode",
  "address",
  "contactName",
  "contactPhone",
  "bankAccountName",
  "bankAccountNumber",
  "bankIfsc",
  "bankName",
  "invoicePrefix",
];

const isField = (value: unknown): value is ProfileField =>
  typeof value === "string" && (FIELDS as readonly string[]).includes(value);

/** A saved account number as the screen shows it: its last four digits, as the platform console shows it. */
export const maskedAccountNumber = (number: string) => `XXXX${number.slice(-4)}`;

/** The form's boxes for the saved profile, or empty ones before any was saved. */
export function profileValuesOf(profile: BusinessProfileDetails | null): ProfileValues {
  const values = Object.fromEntries(FIELDS.map((field) => [field, profile?.[field] ?? ""])) as ProfileValues;
  return { ...values, contactPhone: phoneAsTyped(values.contactPhone) };
}

/** The state a well-formed GSTIN is registered in, by name ("Karnataka"), or null for one that isn't well formed. */
export function stateNameOfGstin(text: string): string | null {
  const gstin = text.trim().toUpperCase();
  if (!isValidGstin(gstin)) return null;
  const code = gstStateCodeFromGstin(gstin);
  return gstStates.find((state) => state.code === code)?.name ?? null;
}

export function toProfileInput(
  values: ProfileValues,
):
  | { ok: true; input: UpdateOrganizationProfileInput }
  | { ok: false; problems: Partial<Record<ProfileField, ProfileProblem>> } {
  const parsed = updateOrganizationProfileInput.safeParse(values);
  if (parsed.success) return { ok: true, input: parsed.data };
  const problems: Partial<Record<ProfileField, ProfileProblem>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (!isField(field) || problems[field] !== undefined) continue;
    problems[field] = problemOf(field, values);
  }
  return { ok: false, problems };
}

function problemOf(field: ProfileField, values: ProfileValues): ProfileProblem {
  // The schema's one rule across fields (a GSTIN starts with its state's code) is a problem of a well-formed GSTIN.
  if (field === "gstin" && stateNameOfGstin(values.gstin) !== null) return "gstinOfAnotherState";
  // The schema refuses the letters the app's own documents are numbered with, upper-cased as it keeps them.
  if (field === "invoicePrefix" && reservedDocumentPrefixes.includes(values.invoicePrefix.trim().toUpperCase())) {
    return "invoicePrefixReserved";
  }
  return field;
}
