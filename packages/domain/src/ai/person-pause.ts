// The AI waits while a person answers (the AI sales agent): someone on the team who wrote in a chat a few minutes ago is
// answering it, so the AI keeps quiet until then, unless the team gave the chat back to it since ("Let AI answer now").
import type { OrgTx } from "@travel-crm/db";

/** How long the AI waits after someone on the team writes in a chat. */
export const PERSON_ANSWERING_MS = 10 * 60_000;

/** Until when the AI waits in this chat for a person who is answering it; null when it needn't wait. */
export async function personAnsweringUntil(tx: OrgTx, conversationId: string, now: Date): Promise<Date | null> {
  const state = await tx.aiChat.findFirst({ where: { conversationId }, select: { resumedAt: true } });
  const since = Math.max(now.getTime() - PERSON_ANSWERING_MS, state?.resumedAt?.getTime() ?? 0);
  const person = await tx.whatsappMessage.findFirst({
    where: {
      conversationId,
      direction: "out",
      origin: { in: ["staff_crm", "staff_phone"] },
      occurredAt: { gt: new Date(since) },
    },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  return person === null ? null : new Date(person.occurredAt.getTime() + PERSON_ANSWERING_MS);
}
