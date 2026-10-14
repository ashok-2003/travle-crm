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
 * about their own action: the actor is left out, and so is anyone in `excludeUserIds`. A listener passes the event's
 * id as `sourceEventId`, so running it again adds nothing. Returns the ids of the notifications this call created.
 */
export async function notify(tx: OrgTx, actor: Actor, input: NotifyInput): Promise<string[]> {
  const { recipientUserIds, excludeUserIds, sourceEventId, kind, title, body, link, channels } = parseInput(
    notifyInput,
    input,
    "INVALID_NOTIFICATION",
  );
  const left = new Set([actor.userId, ...(excludeUserIds ?? [])]);
  const recipients = [...new Set(recipientUserIds)].filter((userId) => !left.has(userId));
  // A repeat of the same source event for the same person is skipped by the unique key: only new rows come back.
  const created = await tx.notification.createManyAndReturn({
    data: recipients.map((recipientUserId) => ({
      recipientUserId,
      kind,
      title,
      body,
      link: link ?? null,
      sourceEventId: sourceEventId ?? null,
    })),
    skipDuplicates: true,
    select: { id: true },
  });
  if (channels.length > 0) {
    for (const { id } of created) {
      await publishEvent(tx, { type: "notification.created", payload: { notificationId: id, channels } });
    }
  }
  return created.map(({ id }) => id);
}
