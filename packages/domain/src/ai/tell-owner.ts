// Tells the lead's owner that the AI needs a person (once per notice key).
import type { OrgTx } from "@travel-crm/db";
import { noticeKey } from "../crm/index.js";
import { systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import type { ChatRow } from "./may-write.js";

export const AI_HANDOFF_KIND = "ai.handoff";
/** A flag tells the lead's owner again only after this long, so a busy chat doesn't ring every few minutes. */
export const ATTENTION_QUIET_MS = 6 * 3_600_000;

export async function tellOwner(
  tx: OrgTx,
  organizationId: string,
  chat: ChatRow,
  notice: { key: string; title: (name: string) => string; body: string },
) {
  if (chat.personId === null) return;
  // The newest lead at any stage, as the old agent always did: a customer writing again on a closed lead still reaches
  // its owner. (Only money actions need an open lead: `openLeadOfChat`.)
  const lead = await tx.lead.findFirst({
    where: { personId: chat.personId },
    orderBy: { createdAt: "desc" },
    select: { ownerUserId: true, person: { select: { name: true } } },
  });
  if (lead === null) return;
  // A lead nobody owns still reaches the members the owner chose for copies of team alerts.
  await notify(tx, systemActor(organizationId), {
    recipientUserIds: lead.ownerUserId === null ? [] : [lead.ownerUserId],
    sourceEventId: noticeKey(notice.key, AI_HANDOFF_KIND),
    kind: AI_HANDOFF_KIND,
    title: notice.title(lead.person.name),
    body: notice.body,
    link: `/inbox/${chat.id}`,
    channels: ["email", "push"],
  });
}
