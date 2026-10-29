// notify(): the one notification service every module calls (spec 9.4). It writes the bell rows and asks the worker
// to deliver by email and push, in the caller's own transaction, as the agency's owner routed them (routing.ts).
import { notifyInput, type NotificationCreatedEvent, type NotifyInput } from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import type { Actor } from "../kernel/index.js";
import { parseInput } from "./parse-input.js";
import { TEAM_ALERT_KINDS, teamRoutingOf } from "./routing.js";

/**
 * Notifies people in the transaction's organization: one notification in each person's bell, and, when channels
 * name email or push, a "notification.created" event per notification for the delivery listener. A team alert also
 * goes to the members the owner chose for copies, and anyone the owner chose for email gets it by email too. Nobody is notified
 * about their own action: the actor is left out, and so is anyone in `excludeUserIds`. A listener passes the event's
 * id as `sourceEventId`, so running it again adds nothing. Returns the ids of the notifications this call created.
 */
export async function notify(tx: OrgTx, actor: Actor, input: NotifyInput): Promise<string[]> {
  const { recipientUserIds, excludeUserIds, sourceEventId, kind, title, body, link, channels } = parseInput(
    notifyInput,
    input,
    "INVALID_NOTIFICATION",
  );
  const routing = await teamRoutingOf(tx);
  const copies = TEAM_ALERT_KINDS.includes(kind) ? routing.copyUserIds : [];
  const left = new Set([actor.userId, ...(excludeUserIds ?? [])]);
  const recipients = [...new Set([...recipientUserIds, ...copies])].filter((userId) => !left.has(userId));
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
    select: { id: true, recipientUserId: true },
  });
  if (channels.length > 0) {
    for (const { id, recipientUserId } of created) {
      const own = routing.emailUserIds.includes(recipientUserId)
        ? [...new Set([...channels, "email" as const])]
        : channels;
      const payload = { notificationId: id, channels: own } satisfies NotificationCreatedEvent;
      await publishEvent(tx, { type: "notification.created", payload });
    }
  }
  return created.map(({ id }) => id);
}
