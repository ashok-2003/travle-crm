// Whether a chat is waiting for an answer (D6): the customer wrote last and no reply that went (or may yet go) followed. A reply
// that failed does not count, so a chat whose only answer failed waits again.
import type { OrgTx } from "@travel-crm/db";

export async function settleNeedsReply(tx: OrgTx, conversationId: string): Promise<void> {
  const lastInbound = await tx.whatsappMessage.findFirst({
    where: { conversationId, direction: "in", kind: { not: "reaction" } },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    select: { occurredAt: true },
  });
  const answered =
    lastInbound === null
      ? 0
      : await tx.whatsappMessage.count({
          where: {
            conversationId,
            direction: "out",
            status: { notIn: ["failed", "superseded"] },
            occurredAt: { gt: lastInbound.occurredAt },
          },
        });
  await tx.whatsappConversation.update({
    where: { id: conversationId },
    data: { needsReply: lastInbound !== null && answered === 0 },
  });
}
