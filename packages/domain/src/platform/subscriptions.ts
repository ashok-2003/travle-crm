// The console's changes to an organization's subscription (spec 7.2-7.4). Each runs in one platform transaction, and
// the subscriptions module records it in that organization's audit log under the platform admin's name.
import type {
  ChangePlanInput,
  EndAccessInput,
  RecordPaymentInput,
  SetOverridesInput,
  SetPaidThroughInput,
  SetTrialEndInput,
  SubscriptionDetails,
  SubscriptionPayment,
  VoidPaymentInput,
} from "@travel-crm/contracts/subscriptions";
import * as subscriptions from "../subscriptions/index.js";
import type { PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** An organization's subscription and its payments, newest first. */
export async function getSubscription(
  services: PlatformServices,
  organizationId: string,
): Promise<{ subscription: SubscriptionDetails; payments: SubscriptionPayment[] }> {
  return services.platformDb.transaction(async (tx) => ({
    subscription: await subscriptions.getSubscription(tx, organizationId),
    payments: await subscriptions.listPayments(tx, organizationId),
  }));
}

export async function changePlan(
  services: PlatformServices,
  staff: PlatformActor,
  input: ChangePlanInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.changePlan(tx, staff, input));
}

export async function setOverrides(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetOverridesInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.setOverrides(tx, staff, input));
}

export async function setTrialEnd(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetTrialEndInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.setTrialEnd(tx, staff, input));
}

export async function setPaidThrough(
  services: PlatformServices,
  staff: PlatformActor,
  input: SetPaidThroughInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.setPaidThrough(tx, staff, input));
}

export async function recordPayment(
  services: PlatformServices,
  staff: PlatformActor,
  input: RecordPaymentInput,
): Promise<SubscriptionPayment> {
  return services.platformDb.transaction((tx) => subscriptions.recordPayment(tx, staff, input));
}

export async function voidPayment(
  services: PlatformServices,
  staff: PlatformActor,
  input: VoidPaymentInput,
): Promise<SubscriptionPayment> {
  return services.platformDb.transaction((tx) => subscriptions.voidPayment(tx, staff, input));
}

export async function suspend(
  services: PlatformServices,
  staff: PlatformActor,
  input: EndAccessInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.suspend(tx, staff, input));
}

export async function cancel(
  services: PlatformServices,
  staff: PlatformActor,
  input: EndAccessInput,
): Promise<SubscriptionDetails> {
  return services.platformDb.transaction((tx) => subscriptions.cancel(tx, staff, input));
}
