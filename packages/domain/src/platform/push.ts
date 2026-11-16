// Web push to the super admins' browsers (the owner, 2026-11-17): the platform's own subscriptions, kept apart from the
// agencies' (platform_push_subscription has no organization), and the one send an incident's opening and ending use.
import {
  pushSubscriptionInput,
  removePushSubscriptionInput,
  type PushSubscriptionInput,
  type RemovePushSubscriptionInput,
} from "@travel-crm/contracts/notifications";
import type { PlatformTx } from "@travel-crm/db/platform";
import { errorFields } from "@travel-crm/integrations/logging";
import { isKnownPushEndpoint, MAX_PUSH_PAYLOAD_BYTES, type PushPayload } from "@travel-crm/integrations/push";
import { platformStaffAccounts } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import type { PlatformServices } from "./services.js";

/** Where a tap opens: the console's updates page. */
export const PLATFORM_PUSH_URL = "/console/updates";

/**
 * Saves a super admin's browser. A browser that subscribes again, for another person, moves to them: one browser, one
 * subscription. The api's route is for super admins only; this checks the input again and the push service's address.
 */
export async function savePlatformPushSubscription(
  services: PlatformServices,
  staff: { userId: string },
  input: PushSubscriptionInput,
): Promise<void> {
  const parsed = pushSubscriptionInput.safeParse(input);
  if (!parsed.success || !isKnownPushEndpoint(parsed.data.endpoint)) {
    throw new DomainError(
      "VALIDATION",
      "INVALID_PUSH_SUBSCRIPTION",
      "Push subscriptions must be on a known push service",
    );
  }
  const { endpoint, keys } = parsed.data;
  await services.platformDb.transaction((tx) =>
    tx.platformPushSubscription.upsert({
      where: { endpoint },
      create: { userId: staff.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { userId: staff.userId, p256dh: keys.p256dh, auth: keys.auth },
    }),
  );
}

/** Removes the browser if it is this person's; another person's stays. */
export async function removePlatformPushSubscription(
  services: PlatformServices,
  staff: { userId: string },
  input: RemovePushSubscriptionInput,
): Promise<void> {
  const { endpoint } = removePushSubscriptionInput.parse(input);
  await services.platformDb.transaction((tx) =>
    tx.platformPushSubscription.deleteMany({ where: { endpoint, userId: staff.userId } }),
  );
}

/** Every browser of one staff member, forgotten: they were removed or demoted, in the caller's transaction. */
export async function forgetPlatformPushSubscriptions(tx: PlatformTx, userId: string): Promise<void> {
  await tx.platformPushSubscription.deleteMany({ where: { userId } });
}

/**
 * Every super admin's browsers told one thing. A browser the push service no longer knows is forgotten; any failure is
 * logged by name and code and the rest still go, so a push never blocks an email.
 */
export async function pushToSuperAdmins(
  services: PlatformServices,
  payload: Omit<PushPayload, "url">,
  queue: string,
): Promise<void> {
  const push = services.push;
  if (push == null) return;
  const full = { ...payload, url: PLATFORM_PUSH_URL };
  if (Buffer.byteLength(JSON.stringify(full)) > MAX_PUSH_PAYLOAD_BYTES) {
    services.logger.error({ queue }, "A platform push was too big to send");
    return;
  }
  const rows = await services.platformDb.transaction(async (tx) => {
    const superAdmins = (await platformStaffAccounts(tx))
      .filter((account) => account.level === "super-admin")
      .map((account) => account.userId);
    return tx.platformPushSubscription.findMany({ where: { userId: { in: superAdmins } } });
  });
  const gone: string[] = [];
  for (const row of rows) {
    try {
      const outcome = await push.send({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }, full);
      if (outcome === "gone") gone.push(row.id);
    } catch (error) {
      services.logger.error({ queue, ...errorFields(error) }, "A super admin couldn't be sent a push");
    }
  }
  if (gone.length > 0) {
    await services.platformDb.transaction((tx) =>
      tx.platformPushSubscription.deleteMany({ where: { id: { in: gone } } }),
    );
  }
}
