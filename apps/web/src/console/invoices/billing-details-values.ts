// The billing details form's values, as text, turned into the api's input by its own schema, each problem on its field.
import type { BillingDetails, SetBillingDetailsInput } from "@travel-crm/contracts/platform";
import { setBillingDetailsInput } from "@travel-crm/contracts/platform";
import { checked, type Checked } from "@/components/forms/checked";

export interface BillingDetailsValues {
  legalName: string;
  address: string;
  stateCode: string;
  pan: string;
  gstin: string;
  phone: string;
  email: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankNameBranch: string;
  upiId: string;
  defaultTerms: string;
  proformaPrefix: string;
  invoicePrefix: string;
}

/** Message keys in the "consoleInvoices.billingDetails.problems" namespace. */
export type BillingDetailsProblem = "required" | "invalid";

const fields = [
  "legalName",
  "address",
  "stateCode",
  "pan",
  "gstin",
  "phone",
  "email",
  "bankAccountName",
  "bankAccountNumber",
  "bankIfsc",
  "bankNameBranch",
  "upiId",
  "defaultTerms",
  "proformaPrefix",
  "invoicePrefix",
] as const satisfies readonly (keyof BillingDetailsValues)[];

const isField = (value: unknown): value is keyof BillingDetailsValues =>
  typeof value === "string" && fields.some((field) => field === value);

/** The form's values for the saved details, or the defaults before the first save. */
export function billingDetailsValues(saved: BillingDetails | null): BillingDetailsValues {
  return {
    legalName: saved?.legalName ?? "",
    address: saved?.address ?? "",
    stateCode: saved?.stateCode ?? "",
    pan: saved?.pan ?? "",
    gstin: saved?.gstin ?? "",
    phone: saved?.phone ?? "",
    email: saved?.email ?? "",
    bankAccountName: saved?.bankAccountName ?? "",
    bankAccountNumber: saved?.bankAccountNumber ?? "",
    bankIfsc: saved?.bankIfsc ?? "",
    bankNameBranch: saved?.bankNameBranch ?? "",
    upiId: saved?.upiId ?? "",
    defaultTerms: saved?.defaultTerms ?? "",
    proformaPrefix: saved?.proformaPrefix ?? "PI",
    invoicePrefix: saved?.invoicePrefix ?? "INV",
  };
}

/** A blank optional field is left out; the schema trims the rest. */
const given = (text: string): string | undefined => (text.trim() === "" ? undefined : text.trim());

export function toSetBillingDetailsInput(
  values: BillingDetailsValues,
): Checked<BillingDetailsValues, SetBillingDetailsInput, BillingDetailsProblem> {
  return checked(
    setBillingDetailsInput.safeParse({
      legalName: values.legalName,
      address: values.address,
      stateCode: values.stateCode,
      pan: given(values.pan),
      gstin: given(values.gstin),
      phone: given(values.phone),
      email: given(values.email),
      bankAccountName: given(values.bankAccountName),
      bankAccountNumber: given(values.bankAccountNumber),
      bankIfsc: given(values.bankIfsc),
      bankNameBranch: given(values.bankNameBranch),
      upiId: given(values.upiId),
      defaultTerms: given(values.defaultTerms),
      proformaPrefix: values.proformaPrefix.trim(),
      invoicePrefix: values.invoicePrefix.trim(),
    }),
    values,
    ([key]) => (isField(key) ? key : undefined),
    () => "invalid",
  );
}
