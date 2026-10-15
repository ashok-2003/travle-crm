// An organization's subscription as the console sees and changes it (spec 7.2-7.4): plan, dates, status, overrides
// and the payments recorded against it.
import { z } from "zod";
import { recordId } from "../identity/index.js";
import { calendarDate } from "../kernel/index.js";
import { planKey, planModule, pricePaise } from "./plans.js";

/** The lifecycle's states (spec 7.3). */
export const subscriptionStatus = z.enum(["trial", "active", "past_due", "read_only", "suspended", "cancelled"]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatus>;

export const billingCycle = z.enum(["monthly", "yearly"]);
export type BillingCycle = z.infer<typeof billingCycle>;

/** Why a platform admin did something by hand, kept in the organization's audit log. */
const reason = z.string().trim().min(1).max(200);

/** How a new organization's subscription starts: on a trial to a given day, or paid through one. */
export const startSubscriptionInput = z.strictObject({
  planId: recordId,
  billingCycle,
  /** The trial's last day; the subscription starts active instead when it is null. */
  trialEndsOn: calendarDate.nullable(),
  /** The last day already paid for, when the subscription starts active. */
  paidThrough: calendarDate.nullable(),
});
export type StartSubscriptionInput = z.infer<typeof startSubscriptionInput>;

export const organizationIdInput = z.strictObject({ organizationId: recordId });
export type OrganizationIdInput = z.infer<typeof organizationIdInput>;

export const changePlanInput = z.strictObject({ organizationId: recordId, planId: recordId, billingCycle });
export type ChangePlanInput = z.infer<typeof changePlanInput>;

/** Overrides (spec 7.2): seats beyond the plan's, an agreed price, modules switched on early. */
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

/** Suspending or cancelling by hand. */
export const endAccessInput = z.strictObject({ organizationId: recordId, reason });
export type EndAccessInput = z.infer<typeof endAccessInput>;

export const subscriptionDetails = z.object({
  organizationId: recordId,
  plan: z.object({ id: recordId, key: planKey, name: z.string() }),
  billingCycle,
  status: subscriptionStatus,
  statusChangedAt: z.iso.datetime(),
  trialEndsOn: calendarDate.nullable(),
  paidThrough: calendarDate.nullable(),
  extraSeats: z.int(),
  customPricePaise: z.int().nullable(),
  extraModules: z.array(planModule),
});
export type SubscriptionDetails = z.infer<typeof subscriptionDetails>;

export const subscriptionPayment = z.object({
  id: recordId,
  amountPaise: z.int(),
  paidOn: calendarDate,
  paidThrough: calendarDate,
  reference: z.string().nullable(),
  provider: z.enum(["manual", "razorpay"]),
  recordedBy: recordId.nullable(),
  recordedAt: z.iso.datetime(),
  voided: z.object({ at: z.iso.datetime(), by: recordId.nullable(), reason: z.string() }).nullable(),
});
export type SubscriptionPayment = z.infer<typeof subscriptionPayment>;

/** How long an organization stays in each unpaid state (spec 7.3; Q3). */
const policyDays = { pastDueDays: z.int().min(1).max(90), readOnlyDays: z.int().min(1).max(180) };

export const setSubscriptionPolicyInput = z.strictObject(policyDays);
export const subscriptionPolicy = z.object(policyDays);
export type SubscriptionPolicy = z.infer<typeof subscriptionPolicy>;

/** An organization's subscription and its payments, as the console shows them. */
export const subscriptionWithPayments = z.object({
  subscription: subscriptionDetails,
  payments: z.array(subscriptionPayment),
});
export type SubscriptionWithPayments = z.infer<typeof subscriptionWithPayments>;

/**
 * What an organization's subscription lets its staff do (spec 7.3): everything; view and export only; only the Owner,
 * only exports and paying; nothing.
 */
export const lifecycleAccess = z.enum(["full", "read_only", "export_only", "locked"]);
export type LifecycleAccess = z.infer<typeof lifecycleAccess>;

/**
 * What subscription.get tells an organization's staff about their own subscription, in every state: the banner, and
 * which modules the app shows. Dates are calendar days in the organization's time zone.
 */
export const subscriptionOverview = z.object({
  status: subscriptionStatus,
  access: lifecycleAccess,
  planName: z.string(),
  modules: z.array(planModule),
  trialEndsOn: calendarDate.nullable(),
  paidThrough: calendarDate.nullable(),
  /** The day the status moves on if nothing is paid, e.g. from past due to read-only; null when it won't. */
  nextChangeOn: calendarDate.nullable(),
  limits: z.object({ seats: z.int(), whatsappNumbers: z.int(), storageBytes: z.int() }),
});
export type SubscriptionOverview = z.infer<typeof subscriptionOverview>;
