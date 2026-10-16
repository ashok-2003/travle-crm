// The business profile form's values, as text, and the api's input made from them. The api's own schema
// (updateOrganizationProfileInput) decides what is valid; each problem is named by the field it belongs to, so the
// form shows its message there, and a GSTIN that is well formed but another state's is told apart from a mistyped one.
import { gstStates, gstStateCodeFromGstin, isValidGstin } from "@travel-crm/contracts/kernel";
import {
  updateOrganizationProfileInput,
  type BusinessProfileDetails,
  type UpdateOrganizationProfileInput,
} from "@travel-crm/contracts/profile";

export type ProfileField = keyof UpdateOrganizationProfileInput;

/** Every box of the form, as typed. A blank box is no value: the api's schema turns "" into null. */
export type ProfileValues = Record<ProfileField, string>;

/** Message keys in "business.profile.problems": the field's own, or a GSTIN of another state than the one chosen. */
export type ProfileProblem = ProfileField | "gstinOfAnotherState";

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

/** India's numbers are shown after the form's own +91, grouped as people write them: "98765 43210". */
function phoneAsTyped(e164: string): string {
  const national = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return national ? `${national[1] ?? ""} ${national[2] ?? ""}` : e164;
}

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
    // The schema's one rule across fields (a GSTIN starts with its state's code) is a problem of a well-formed GSTIN.
    problems[field] = field === "gstin" && stateNameOfGstin(values.gstin) !== null ? "gstinOfAnotherState" : field;
  }
  return { ok: false, problems };
}
