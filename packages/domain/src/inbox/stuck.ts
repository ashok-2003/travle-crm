// Replies the sender never settled (spec 8.4, S2): a row left `sending` (a crashed worker) is "couldn't confirm"; a row left
// `queued` past five minutes (MSG91 down, the budget spent, the job's retries used up) is "couldn't send". Both are failed, so
// the chat shows Not sent with Try again, the chat waits for an answer again, and the person who wrote it is told.
import type { OrgTx } from "@travel-crm/db";
import { noticeKey } from "../crm/index.js";
import { systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { chatNameOf } from "./chat-name.js";
import { settleNeedsReply } from "./needs-reply.js";
import { bumpUsage, monthStartOf } from "./usage.js";

export async function failStuckReplies(
  tx: OrgTx,
  scope: { organizationId: string; connectionId: string },
  which: { status: "queued" | "sending"; before: Date },
  code: "unsure" | "provider_down",
  now: Date,
): Promise<number> {
  const rows = await tx.whatsappMessage.findMany({
    where: {
      direction: "out",
      origin: "staff_crm",
      status: which.status,
      ...(which.status === "sending" ? { sentAt: { lt: which.before } } : { occurredAt: { lt: which.before } }),
    },
    select: {
      id: true,
      conversationId: true,
      sentBy: true,
      conversation: { select: { phoneE164: true, profileName: true, person: { select: { name: true } } } },
    },
  });
  for (const row of rows) {
    await tx.whatsappMessage.update({ where: { id: row.id }, data: { status: "failed", failureCode: code } });
    await settleNeedsReply(tx, row.conversationId);
    await bumpUsage(tx, scope, monthStartOf(now, "Asia/Kolkata"), { failed: 1 });
    if (row.sentBy !== null) {
      await notify(tx, systemActor(scope.organizationId), {
        recipientUserIds: [row.sentBy],
        sourceEventId: noticeKey(row.id, "whatsapp.send-failed"),
        kind: "whatsapp.send-failed",
        title: `Your message to ${chatNameOf(row.conversation) ?? row.conversation.phoneE164} wasn't sent`,
        body: "Open the chat and tap Try again.",
        link: `/inbox/${row.conversationId}`,
        channels: ["push"],
      });
    }
  }
  return rows.length;
}
