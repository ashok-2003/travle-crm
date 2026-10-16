// The subscription forms' values, as text, turned into subscriptions.*'s inputs by the api's own schemas: rupees typed
// as people write them read into paise, a blank optional box as none. Each problem is named on the field it belongs
// to (message keys in "consoleOrganizations.subscription.problems").
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import {
  changePlanInput,
  endAccessInput,
  recordPaymentInput,
  setOverridesInput,
  setPaidThroughInput,
  setTrialEndInput,
  voidPaymentInput,
  type ChangePlanInput,
  type EndAccessInput,
  type PlanModule,
  type RecordPaymentInput,
  type SetOverridesInput,
  type SetPaidThroughInput,
  type SetTrialEndInput,
  type VoidPaymentInput,
} from "@travel-crm/contracts/subscriptions";
import type { z } from "zod";

export type SubscriptionProblem = "required" | "amountInvalid" | "dateInvalid" | "seatsInvalid" | "tooLong";

export type Checked<Values, Input> =
  { ok: true; input: Input } | { ok: false; problems: Partial<Record<keyof Values & string, SubscriptionProblem>> };

/**
 * Parses raw with the schema; each refused input key is put on its form field (`fields`, input key to field), as
 * "required" when the field was left blank and as the field's own problem otherwise.
 */
function check<Values extends Record<string, unknown>, Input>(
  schema: z.ZodType<Input>,
  raw: unknown,
  values: Values,
  fields: Partial<Record<string, keyof Values & string>>,
  problemOf: Partial<Record<keyof Values & string, SubscriptionProblem>>,
): Checked<Values, Input> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, input: parsed.data };
  const problems: Partial<Record<keyof Values & string, SubscriptionProblem>> = {};
  for (const issue of parsed.error.issues) {
    const field = fields[String(issue.path[0])];
    if (field === undefined || problems[field] !== undefined) continue;
    const value = values[field];
    problems[field] = typeof value === "string" && value.trim() === "" ? "required" : (problemOf[field] ?? "required");
  }
  return { ok: false, problems };
}

/** Paise for rupees typed, or -1 (refused by every amount's schema) for text that isn't an amount. */
const paiseOrInvalid = (text: string) => paiseFromRupeesText(text) ?? -1;

export interface PlanValues extends Record<string, unknown> {
  planId: string;
  billingCycle: string;
}

export function toChangePlanInput(organizationId: string, values: PlanValues): Checked<PlanValues, ChangePlanInput> {
  return check(
    changePlanInput,
    { organizationId, ...values },
    values,
    { planId: "planId", billingCycle: "billingCycle" },
    {},
  );
}

export interface OverridesValues extends Record<string, unknown> {
  extraSeats: string;
  customPrice: string;
  extraModules: PlanModule[];
}

export function toOverridesInput(
  organizationId: string,
  values: OverridesValues,
): Checked<OverridesValues, SetOverridesInput> {
  const raw = {
    organizationId,
    extraSeats: /^\d+$/.test(values.extraSeats.trim()) ? Number(values.extraSeats.trim()) : -1,
    customPricePaise: values.customPrice.trim() === "" ? null : paiseOrInvalid(values.customPrice),
    extraModules: values.extraModules,
  };
  return check(
    setOverridesInput,
    raw,
    values,
    { extraSeats: "extraSeats", customPricePaise: "customPrice", extraModules: "extraModules" },
    { extraSeats: "seatsInvalid", customPrice: "amountInvalid" },
  );
}

export interface TrialEndValues extends Record<string, unknown> {
  trialEndsOn: string;
}

export function toTrialEndInput(
  organizationId: string,
  values: TrialEndValues,
): Checked<TrialEndValues, SetTrialEndInput> {
  return check(
    setTrialEndInput,
    { organizationId, ...values },
    values,
    { trialEndsOn: "trialEndsOn" },
    {
      trialEndsOn: "dateInvalid",
    },
  );
}

export interface PaidThroughValues extends Record<string, unknown> {
  paidThrough: string;
  reason: string;
}

export function toPaidThroughInput(
  organizationId: string,
  values: PaidThroughValues,
): Checked<PaidThroughValues, SetPaidThroughInput> {
  return check(
    setPaidThroughInput,
    { organizationId, ...values },
    values,
    { paidThrough: "paidThrough", reason: "reason" },
    { paidThrough: "dateInvalid", reason: "tooLong" },
  );
}

export interface PaymentValues extends Record<string, unknown> {
  amount: string;
  paidOn: string;
  paidThrough: string;
  reference: string;
}

export function toRecordPaymentInput(
  organizationId: string,
  values: PaymentValues,
): Checked<PaymentValues, RecordPaymentInput> {
  const raw = {
    organizationId,
    amountPaise: values.amount.trim() === "" ? undefined : paiseOrInvalid(values.amount),
    paidOn: values.paidOn,
    paidThrough: values.paidThrough,
    reference: values.reference.trim() === "" ? null : values.reference,
  };
  return check(
    recordPaymentInput,
    raw,
    values,
    { amountPaise: "amount", paidOn: "paidOn", paidThrough: "paidThrough", reference: "reference" },
    { amount: "amountInvalid", paidOn: "dateInvalid", paidThrough: "dateInvalid", reference: "tooLong" },
  );
}

export interface ReasonValues extends Record<string, unknown> {
  reason: string;
}

/** Suspending, lifting a suspension and cancelling: the organization and why. */
export function toEndAccessInput(organizationId: string, values: ReasonValues): Checked<ReasonValues, EndAccessInput> {
  return check(endAccessInput, { organizationId, ...values }, values, { reason: "reason" }, { reason: "tooLong" });
}

export function toVoidPaymentInput(
  organizationId: string,
  paymentId: string,
  values: ReasonValues,
): Checked<ReasonValues, VoidPaymentInput> {
  return check(
    voidPaymentInput,
    { organizationId, paymentId, ...values },
    values,
    { reason: "reason" },
    {
      reason: "tooLong",
    },
  );
}
