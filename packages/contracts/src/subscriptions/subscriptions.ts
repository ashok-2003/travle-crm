// The console's changes to an organization's subscription (spec 7.2-7.4): starting it, its plan, dates and
// overrides, payments, suspending and cancelling by hand, and the lifecycle's policy.
import { z } from "zod";
import { recordId } from "../identity/index.js";
import { calendarDate } from "../kernel/index.js";
import { planModule, pricePaise } from "./plans.js";

/** The lifecycle's states (spec 7.3). */
export const subscriptionStatus = z.enum(["trial", "active", "past_due", "read_only", "suspended", "cancelled"]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatus>;

/** Which of the plan's prices the organization pays: monthly or annually. */
export const billingCycle = z.enum(["monthly", "yearly"]);
export type BillingCycle = z.infer<typeof billingCycle>;

/** Why a platform admin did something by hand, kept in the organization's audit log. */
const reason = z.string().trim().min(1).max(200);

/** How a new organization's subscription starts: on a trial, or active and paid through a day. */
export const startSubscriptionInput = z.strictObject({
  planId: recordId,
  billingCycle,
  /**
   * The trial's last day. Left out, the trial lasts the policy's trial days (7), today included; null, there is no
   * trial and the subscription starts active, paid through paidThrough.
   */
  trialEndsOn: calendarDate.nullable().optional(),
  /** The last day already paid for, when the subscription starts active. */
  paidThrough: calendarDate.nullable(),
});
export type StartSubscriptionInput = z.infer<typeof startSubscriptionInput>;

export const organizationIdInput = z.strictObject({ organizationId: recordId });
export type OrganizationIdInput = z.infer<typeof organizationIdInput>;

export const changePlanInput = z.strictObject({ organizationId: recordId, planId: recordId, billingCycle });
export type ChangePlanInput = z.infer<typeof changePlanInput>;

/**
 * Extra seats bought above the plan's, each at the plan's extra-seat price, and the overrides (spec 7.2): an agreed
 * price per billing cycle before GST, in place of the plan's, and modules switched on early.
 */
export const setOverridesInput = z.strictObject({
  organizationId: recordId,
  extraSeats: z.int().min(0).max(10_000),
  customPricePaise: pricePaise.nullable(),
  extraModules: z.array(planModule).max(20),
});
export type SetOverridesInput = z.infer<typeof setOverridesInput>;

export const setTrialEndInput = z.strictObject({ organizationId: recordId, trialEndsOn: calendarDate });
export type SetTrialEndInput = z.infer<typeof setTrialEndInput>;

/** Gives an organization time without a payment, or corrects the paid-through day. */
export const setPaidThroughInput = z.strictObject({ organizationId: recordId, paidThrough: calendarDate, reason });
export type SetPaidThroughInput = z.infer<typeof setPaidThroughInput>;

/**
 * A payment received on `paidOn` that pays through `paidThrough`. That day may be before it was paid: money for a past
 * period (arrears), whose effect the lifecycle decides.
 */
export const recordPaymentInput = z.strictObject({
  organizationId: recordId,
  amountPaise: pricePaise.min(1),
  paidOn: calendarDate,
  paidThrough: calendarDate,
  /** How it was paid, e.g. "NEFT UTR 412345678901". */
  reference: z.string().trim().min(1).max(100).nullable(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentInput>;

export const voidPaymentInput = z.strictObject({ organizationId: recordId, paymentId: recordId, reason });
export type VoidPaymentInput = z.infer<typeof voidPaymentInput>;

/** Suspending or cancelling by hand, and lifting a suspension made by hand (super admins). */
export const endAccessInput = z.strictObject({ organizationId: recordId, reason });
export type EndAccessInput = z.infer<typeof endAccessInput>;

/**
 * How long a new organization's trial lasts, and how long an organization stays in each unpaid state (spec 7.3; Q3;
 * the owner's 7-day trial).
 */
const policyDays = {
  trialDays: z.int().min(1).max(90),
  pastDueDays: z.int().min(1).max(90),
  readOnlyDays: z.int().min(1).max(180),
};

export const setSubscriptionPolicyInput = z.strictObject(policyDays);
export const subscriptionPolicy = z.object(policyDays);
export type SubscriptionPolicy = z.infer<typeof subscriptionPolicy>;
