// "Needs attention" notices (spec 4.8): something the agency can act on has gone wrong with WhatsApp: a template Meta rejected
// (told to whoever wrote it and the Owner), WhatsApp's own daily limit on new chats reached, or storage too full to keep a
// customer's file (told to everyone who can assign leads). Never a word of a message. Told once: the same notice is not
// repeated for the same person within the hour.
import type { OrgTx } from "@travel-crm/db";
import { notify } from "../notifications/index.js";
import type { Actor } from "../kernel/index.js";

export const NEEDS_ATTENTION_KIND = "whatsapp.needs-attention";
const QUIET_MS = 60 * 60_000;

export async function notifyNeedsAttention(
  tx: OrgTx,
  actor: Actor,
  input: { recipientUserIds: string[]; title: string; body: string; sourceEventId: string; now: Date },
): Promise<void> {
  const recent = await tx.notification.findMany({
    where: {
      kind: NEEDS_ATTENTION_KIND,
      title: input.title,
      createdAt: { gt: new Date(input.now.getTime() - QUIET_MS) },
    },
    select: { recipientUserId: true },
  });
  const told = new Set(recent.map((row) => row.recipientUserId));
  const recipientUserIds = [...new Set(input.recipientUserIds)].filter((userId) => !told.has(userId));
  if (recipientUserIds.length === 0) return;
  await notify(tx, actor, {
    recipientUserIds,
    sourceEventId: input.sourceEventId,
    kind: NEEDS_ATTENTION_KIND,
    title: input.title,
    body: input.body,
    link: "/settings/whatsapp",
    channels: ["push"],
  });
}
