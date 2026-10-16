// The acting person's browsers that may receive web push.
import {
  pushSubscriptionInput,
  removePushSubscriptionInput,
  type PushSubscriptionInput,
  type RemovePushSubscriptionInput,
} from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import { isKnownPushEndpoint } from "@travel-crm/integrations/push";
import { DomainError, type Actor } from "../kernel/index.js";
import { parseInput } from "./parse-input.js";
import { asPerson } from "./person.js";

/**
 * Saves a browser's subscription for the acting person. Within the organization a browser that subscribes again,
 * perhaps for someone else on a shared tablet, moves to that person: one browser, one subscription. Another
 * organization's row for the same browser is out of reach here (row-level security), so the web app drops the browser's
 * subscription on the device at every sign-in and sign-out: the next person gets a new endpoint, and the push service
 * answers 404 or 410 for the old one, which deletes its row.
 */
export async function savePushSubscription(tx: OrgTx, actor: Actor, input: PushSubscriptionInput): Promise<void> {
  const person = asPerson(actor);
  const { endpoint, keys } = parseInput(pushSubscriptionInput, input, "INVALID_PUSH_SUBSCRIPTION");
  // The worker calls this address, so only the browsers' own push services are accepted.
  if (!isKnownPushEndpoint(endpoint)) {
    throw new DomainError(
      "VALIDATION",
      "INVALID_PUSH_SUBSCRIPTION",
      "Push subscriptions must be on a known push service",
    );
  }
  await tx.pushSubscription.upsert({
    where: { organizationId_endpoint: { organizationId: person.organizationId, endpoint } },
    create: { userId: person.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: person.userId, p256dh: keys.p256dh, auth: keys.auth },
  });
}

/** Removes one of the acting person's subscriptions. Returns false when they had none for that endpoint. */
export async function removePushSubscription(
  tx: OrgTx,
  actor: Actor,
  input: RemovePushSubscriptionInput,
): Promise<boolean> {
  const person = asPerson(actor);
  const { endpoint } = parseInput(removePushSubscriptionInput, input, "INVALID_PUSH_SUBSCRIPTION");
  const removed = await tx.pushSubscription.deleteMany({ where: { endpoint, userId: person.userId } });
  return removed.count > 0;
}
