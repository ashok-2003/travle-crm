// When the lite turn cannot answer safely it sends nothing and tells the team: the chat's attention fields and the owner's notice, keyed on the turn's token so a retried job tells once.
import type { Database } from "@travel-crm/db";
import type { ChatRow } from "../may-write.js";
import { tellOwner } from "../tell-owner.js";

export async function flagChat(
  db: Database,
  input: {
    organizationId: string;
    chat: ChatRow;
    token: string;
    /** A reason code (amount, date, place, unfit, a booking refusal's reason...), never the customer's words. */
    code: string;
    now: Date;
    /** The chat goes to a person: the AI stops answering it until the team gives it back. */
    handOver?: boolean;
  },
): Promise<void> {
  const { chat, code, now, organizationId } = input;
  const attention = `The AI could not answer safely (${code}): please answer this customer.`;
  const handedOff = input.handOver === true ? { handedOffAt: now, handoffReason: attention, followUpAt: null } : {};
  await db.forOrg(organizationId, async (tx) => {
    await tx.aiChat.upsert({
      where: { organizationId_conversationId: { organizationId, conversationId: chat.id } },
      create: { conversationId: chat.id, attentionReason: attention, attentionAt: now, ...handedOff },
      update: { attentionReason: attention, attentionAt: now, ...handedOff },
    });
    await tellOwner(
      tx,
      organizationId,
      chat,
      input.handOver === true
        ? {
            key: `ai-handoff:${input.token}`,
            title: (name) => `${name} needs you: the AI handed the chat over`,
            body: attention,
          }
        : {
            key: `ai-blocked:${input.token}`,
            title: (name) => `${name}: the AI needs you (${code})`.slice(0, 120),
            body: "The AI sent nothing. Open the chat to answer this customer.",
          },
    );
  });
}
