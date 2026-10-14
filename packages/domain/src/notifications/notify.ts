// notify(): the one notification service every module calls (spec 9.4). It writes the bell rows and asks the worker
// to deliver by email and push, in the caller's own transaction.
import { notifyInput, type NotifyInput } from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import type { Actor } from "../kernel/index.js";
import { parseInput } from "./parse-input.js";

/**
 * Notifies people in the transaction's organization: one notification in each person's bell, and, when channels
 * name email or push, a "notification.created" event per notification for the delivery listener. Nobody is notified
 * about their own action: the actor is left out. Returns the new notifications' ids.
 */
export async function notify(tx: OrgTx, actor: Actor, input: NotifyInput): Promise<string[]> {
  const { recipientUserIds, kind, title, body, link, channels } = parseInput(
    notifyInput,
    input,
    "INVALID_NOTIFICATION",
  );
  const recipients = [...new Set(recipientUserIds)].filter((userId) => userId !== actor.userId);
  const ids: string[] = [];
  for (const recipientUserId of recipients) {
    const created = await tx.notification.create({
      data: { recipientUserId, kind, title, body, link: link ?? null },
      select: { id: true },
    });
    if (channels.length > 0) {
      await publishEvent(tx, { type: "notification.created", payload: { notificationId: created.id, channels } });
    }
    ids.push(created.id);
  }
  return ids;
}
