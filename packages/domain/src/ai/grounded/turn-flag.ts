// When the turn cannot answer safely it sends nothing and tells the team: the chat's attention fields and the owner's notice,
// the same ones the old agent uses, keyed on the turn's token so a retried job tells once. The facts the read settled are kept.
import type { ChatFacts } from "@travel-crm/contracts/ai";
import type { Database } from "@travel-crm/db";
import { tellOwner, type ChatFacts as ChatRow } from "../agent-effects.js";
import { saveFacts } from "./facts.js";

export async function flagChat(
  db: Database,
  input: {
    organizationId: string;
    chat: ChatRow;
    token: string;
    /** A reason code (amount, date, place, unfit, a booking refusal's reason...), never the customer's words. */
    code: string;
    facts: ChatFacts | null;
    now: Date;
  },
): Promise<void> {
  const { chat, code, now, organizationId } = input;
  const attention = `The AI could not answer safely (${code}): please answer this customer.`;
  await db.forOrg(organizationId, async (tx) => {
    if (input.facts !== null) await saveFacts(tx, chat.id, input.facts);
    await tx.aiChat.upsert({
      where: { organizationId_conversationId: { organizationId, conversationId: chat.id } },
      create: { conversationId: chat.id, attentionReason: attention, attentionAt: now },
      update: { attentionReason: attention, attentionAt: now },
    });
    await tellOwner(tx, organizationId, chat, {
      key: `ai-blocked:${input.token}`,
      title: (name) => `${name}: the AI needs you (${code})`.slice(0, 120),
      body: "The AI sent nothing. Open the chat to answer this customer.",
    });
  });
}
