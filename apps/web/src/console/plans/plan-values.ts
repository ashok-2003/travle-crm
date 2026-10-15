// The plan form's values, as text, turned into the api's input: rupees as people type them read into paise and storage
// in GB into bytes, digit by digit, never through a float. The api's own schemas decide what is valid; each problem
// is named so the form shows its message on the field it belongs to.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import {
  createPlanInput,
  updatePlanInput,
  type CreatePlanInput,
  type PlanModule,
  type PlanSummary,
  type UpdatePlanInput,
} from "@travel-crm/contracts/subscriptions";
import { money } from "@travel-crm/domain/kernel";
import { formatRupees } from "@/lib/format";

export interface PlanValues {
  key: string;
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  extraSeatMonthlyPrice: string;
  extraSeatYearlyPrice: string;
  seats: string;
  whatsappNumbers: string;
  storageGigabytes: string;
  modules: PlanModule[];
}

export type PlanField = Exclude<keyof PlanValues, "modules">;

/** Message keys in the "consolePlatform.planForm.problems" namespace. */
export type PlanProblem =
  | "keyInvalid"
  | "nameRequired"
  | "priceInvalid"
  | "priceRequired"
  | "seatsInvalid"
  | "whatsappInvalid"
  | "storageInvalid";

export type PlanProblems = Partial<Record<PlanField, PlanProblem>>;

type Result<Input> = { ok: true; input: Input } | { ok: false; problems: PlanProblems };

/** Storage is entered in GB of 1,024 MB, as formatFileSize shows it. */
const GIGABYTE = 1024 ** 3;

/** Each field of the api's input, with the form field it comes from and that field's problem. */
const fieldOf = {
  key: ["key", "keyInvalid"],
  name: ["name", "nameRequired"],
  monthlyPricePaise: ["monthlyPrice", "priceInvalid"],
  yearlyPricePaise: ["yearlyPrice", "priceInvalid"],
  extraSeatMonthlyPricePaise: ["extraSeatMonthlyPrice", "priceInvalid"],
  extraSeatYearlyPricePaise: ["extraSeatYearlyPrice", "priceInvalid"],
  seatLimit: ["seats", "seatsInvalid"],
  whatsappNumberLimit: ["whatsappNumbers", "whatsappInvalid"],
  storageLimitBytes: ["storageGigabytes", "storageInvalid"],
} as const satisfies Record<string, readonly [PlanField, PlanProblem]>;

const isInputField = (value: unknown): value is keyof typeof fieldOf =>
  typeof value === "string" && Object.hasOwn(fieldOf, value);

/** "12,50,000", "1,250.50" or "" for no price: an amount as the form shows it. */
export function rupeesTextOf(paise: number | null): string {
  return paise === null ? "" : formatRupees(money(paise)).replace("₹", "");
}

/** "25", "2.5", "931.32": GB to two decimals at most. */
export function gigabytesTextOf(bytes: number): string {
  const hundredths = Math.round((bytes * 100) / GIGABYTE);
  const fraction = String(hundredths % 100)
    .padStart(2, "0")
    .replace(/0$/, "");
  return hundredths % 100 === 0
    ? String(Math.floor(hundredths / 100))
    : `${String(Math.floor(hundredths / 100))}.${fraction}`;
}

/** The form's values for a plan, or blank ones for a new plan. */
export function planValues(plan?: PlanSummary): PlanValues {
  if (!plan) {
    return {
      key: "",
      name: "",
      monthlyPrice: "",
      yearlyPrice: "",
      extraSeatMonthlyPrice: "",
      extraSeatYearlyPrice: "",
      seats: "",
      whatsappNumbers: "",
      storageGigabytes: "",
      modules: [],
    };
  }
  return {
    key: plan.key,
    name: plan.name,
    monthlyPrice: rupeesTextOf(plan.monthlyPricePaise),
    yearlyPrice: rupeesTextOf(plan.yearlyPricePaise),
    extraSeatMonthlyPrice: rupeesTextOf(plan.extraSeatMonthlyPricePaise),
    extraSeatYearlyPrice: rupeesTextOf(plan.extraSeatYearlyPricePaise),
    seats: String(plan.seatLimit),
    whatsappNumbers: String(plan.whatsappNumberLimit),
    storageGigabytes: gigabytesTextOf(plan.storageLimitBytes),
    modules: plan.modules,
  };
}

/** A typed price in paise, null for a blank one, NaN for text that isn't an amount (the schema then refuses it). */
function paiseOf(text: string): number | null {
  return text.trim() === "" ? null : (paiseFromRupeesText(text) ?? Number.NaN);
}

function wholeNumberOf(text: string): number {
  const digits = text.trim().replaceAll(",", "");
  return /^\d{1,9}$/.test(digits) ? Number(digits) : Number.NaN;
}

/** GB to two decimals in bytes; the plan's own bytes when its GB as shown weren't changed (they may not be whole). */
function bytesOf(text: string, original: PlanSummary | undefined): number {
  const trimmed = text.trim().replaceAll(",", "");
  if (original && trimmed === gigabytesTextOf(original.storageLimitBytes)) return original.storageLimitBytes;
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return Number.NaN;
  const [, whole = "", fraction = ""] = match;
  return Math.round((Number(whole + fraction.padEnd(2, "0")) * GIGABYTE) / 100);
}

function fieldsOf(values: PlanValues, original?: PlanSummary) {
  return {
    name: values.name,
    monthlyPricePaise: paiseOf(values.monthlyPrice),
    yearlyPricePaise: paiseOf(values.yearlyPrice),
    extraSeatMonthlyPricePaise: paiseOf(values.extraSeatMonthlyPrice),
    extraSeatYearlyPricePaise: paiseOf(values.extraSeatYearlyPrice),
    seatLimit: wholeNumberOf(values.seats),
    whatsappNumberLimit: wholeNumberOf(values.whatsappNumbers),
    storageLimitBytes: bytesOf(values.storageGigabytes, original),
    modules: values.modules,
  };
}

/**
 * The schema's verdict, each problem on its field. A plan priced neither monthly nor yearly is said so whatever else is
 * wrong: the schema checks that only once every field is valid.
 */
function resultOf<Input>(
  parsed: { success: true; data: Input } | { success: false; error: { issues: { path: PropertyKey[] }[] } },
  fields: ReturnType<typeof fieldsOf>,
): Result<Input> {
  const unpriced = fields.monthlyPricePaise === null && fields.yearlyPricePaise === null;
  if (parsed.success && !unpriced) return { ok: true, input: parsed.data };
  const problems: PlanProblems = unpriced ? { monthlyPrice: "priceRequired" } : {};
  for (const issue of parsed.success ? [] : parsed.error.issues) {
    const field = issue.path[0];
    if (!isInputField(field)) continue;
    const [formField, problem] = fieldOf[field];
    problems[formField] ??= problem;
  }
  return { ok: false, problems };
}

export function toCreatePlanInput(values: PlanValues): Result<CreatePlanInput> {
  const fields = fieldsOf(values);
  return resultOf(createPlanInput.safeParse({ key: values.key.trim(), ...fields }), fields);
}

/** Everything but the key, which never changes. */
export function toUpdatePlanInput(plan: PlanSummary, values: PlanValues): Result<UpdatePlanInput> {
  const fields = fieldsOf(values, plan);
  return resultOf(updatePlanInput.safeParse({ planId: plan.id, ...fields }), fields);
}
