// Erasing one person (spec 5): every notification sent to them, their opt-outs, morning setting and their browsers go. Run by the
// platform's erasure as the platform role; the runtime role may not delete notifications.
import type { OrgTx } from "@travel-crm/db";

/** Deletes what notifications keep about the person in the organization, and says how many of each went. */
export async function forgetRecipient(
  tx: OrgTx,
  person: { organizationId: string; userId: string },
): Promise<{ notifications: number; preferences: number; pushSubscriptions: number; morningSettings: number }> {
  const where = { organizationId: person.organizationId };
  const notifications = await tx.notification.deleteMany({ where: { ...where, recipientUserId: person.userId } });
  const preferences = await tx.notificationPreference.deleteMany({ where: { ...where, userId: person.userId } });
  const pushSubscriptions = await tx.pushSubscription.deleteMany({ where: { ...where, userId: person.userId } });
  const morningSettings = await tx.morningPushSetting.deleteMany({ where: { ...where, userId: person.userId } });
  return {
    morningSettings: morningSettings.count,
    notifications: notifications.count,
    preferences: preferences.count,
    pushSubscriptions: pushSubscriptions.count,
  };
}
