// The in-app bell: a person's own notifications, newest first, and marking them read.
import {
  listNotificationsInput,
  markReadInput,
  type ListNotificationsInput,
  type MarkReadInput,
  type NotificationPage,
  type NotificationSummary,
} from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { parseInput } from "./parse-input.js";
import { asPerson } from "./person.js";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
  readAt: Date | null;
}

const summaryOf = (row: NotificationRow): NotificationSummary => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  link: row.link,
  createdAt: row.createdAt.toISOString(),
  readAt: row.readAt?.toISOString() ?? null,
});

/** One page of the acting person's notifications, newest first. UUID v7 ids sort by time, so they are the cursor. */
export async function listNotifications(
  tx: OrgTx,
  actor: Actor,
  input: ListNotificationsInput,
): Promise<NotificationPage> {
  const person = asPerson(actor);
  const { cursor, limit } = parseInput(listNotificationsInput, input, "INVALID_PAGE");
  const rows = await tx.notification.findMany({
    where: { recipientUserId: person.userId, ...(cursor === undefined ? {} : { id: { lt: cursor } }) },
    orderBy: { id: "desc" },
    // One more than the page, to know whether another page follows.
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return {
    notifications: page.map(summaryOf),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function unreadCount(tx: OrgTx, actor: Actor): Promise<number> {
  const person = asPerson(actor);
  return tx.notification.count({ where: { recipientUserId: person.userId, readAt: null } });
}

/** Marks some or all of the acting person's unread notifications read. Others' ids are ignored. Returns how many. */
export async function markRead(tx: OrgTx, actor: Actor, input: MarkReadInput): Promise<number> {
  const person = asPerson(actor);
  const which = parseInput(markReadInput, input, "INVALID_MARK_READ");
  const marked = await tx.notification.updateMany({
    where: {
      recipientUserId: person.userId,
      readAt: null,
      ...("notificationIds" in which ? { id: { in: which.notificationIds } } : {}),
    },
    data: { readAt: new Date() },
  });
  return marked.count;
}
