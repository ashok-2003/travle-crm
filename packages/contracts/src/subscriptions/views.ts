// What is shown of a subscription: to the console, its state today and as recorded, its price with GST and its
// payments; to the organization's own staff, what it allows today, without a price.
import { z } from "zod";
import { recordId } from "../identity/index.js";
import { calendarDate } from "../kernel/index.js";
import { planKey, planModule } from "./plans.js";
import { billingCycle, subscriptionStatus } from "./subscriptions.js";

/**
 * What an organization's subscription lets its staff do (spec 7.3): everything; view and export only; only the Owner,
 * only exports and paying; nothing.
 */
export const lifecycleAccess = z.enum(["full", "read_only", "export_only", "locked"]);
export type LifecycleAccess = z.infer<typeof lifecycleAccess>;

/**
 * What a subscription costs per billing cycle, in paise: the plan's flat price (or the agreed one) and the extra seats
 * at the plan's seat price, before GST; then GST at 18 % apart, as Indian buyers expect "+18% GST": CGST and SGST at
 * 9 % each, rounded on their own as the kernel's GST engine does, so the halves always add up to `gstPaise`.
 */
export const subscriptionPrice = z.object({
  cycle: billingCycle,
  basePaise: z.int(),
  extraSeats: z.int(),
  extraSeatsPaise: z.int(),
  subtotalPaise: z.int(),
  cgstPaise: z.int(),
  sgstPaise: z.int(),
  gstPaise: z.int(),
  totalPaise: z.int(),
});
export type SubscriptionPrice = z.infer<typeof subscriptionPrice>;

/** A suspension by platform staff: it holds, whatever is paid, until a super admin lifts it. */
export const manualSuspension = z.object({ at: z.iso.datetime(), by: recordId.nullable(), reason: z.string() });
export type ManualSuspension = z.infer<typeof manualSuspension>;

/** An organization's subscription as the console shows it. Dates are calendar days in the organization's time zone. */
export const subscriptionDetails = z.object({
  organizationId: recordId,
  plan: z.object({ id: recordId, key: planKey, name: z.string() }),
  billingCycle,
  /** The state due today, which every rule uses: the lifecycle's, or suspended while suspended by hand. */
  status: subscriptionStatus,
  access: lifecycleAccess,
  /** The first day of the lifecycle's state today. */
  since: calendarDate,
  /** The day the lifecycle moves on if nothing is paid; null when only a person moves it. */
  nextChangeOn: calendarDate.nullable(),
  /** What the nightly job last recorded; it differs from today's lifecycle until the job has caught up. */
  recorded: z.object({ status: subscriptionStatus, since: calendarDate }),
  manualSuspension: manualSuspension.nullable(),
  trialEndsOn: calendarDate.nullable(),
  paidThrough: calendarDate.nullable(),
  extraSeats: z.int(),
  customPricePaise: z.int().nullable(),
  extraModules: z.array(planModule),
  /** Every subscription has one: it is on a cycle its plan is sold on, which the plan can't drop while it is. */
  price: subscriptionPrice,
});
export type SubscriptionDetails = z.infer<typeof subscriptionDetails>;

/** Who reported a payment: the console ("manual"), or later Razorpay's webhook. */
export const paymentProvider = z.enum(["manual", "razorpay"]);
export type PaymentProvider = z.infer<typeof paymentProvider>;

export const subscriptionPayment = z.object({
  id: recordId,
  amountPaise: z.int(),
  paidOn: calendarDate,
  paidThrough: calendarDate,
  reference: z.string().nullable(),
  provider: paymentProvider,
  recordedBy: recordId.nullable(),
  recordedAt: z.iso.datetime(),
  voided: z.object({ at: z.iso.datetime(), by: recordId.nullable(), reason: z.string() }).nullable(),
});
export type SubscriptionPayment = z.infer<typeof subscriptionPayment>;

/** An organization's subscription and its payments, as the console shows them. */
export const subscriptionWithPayments = z.object({
  subscription: subscriptionDetails,
  payments: z.array(subscriptionPayment),
});
export type SubscriptionWithPayments = z.infer<typeof subscriptionWithPayments>;

/**
 * What subscription.get tells an organization's staff about their own subscription, in every state: the banner, and
 * which modules the app shows. No price: that is between the platform and the Owner. Dates are calendar days in the
 * organization's time zone.
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
