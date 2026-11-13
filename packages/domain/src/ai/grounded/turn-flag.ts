// When the turn cannot answer safely it sends nothing and tells the team: the chat's attention fields and the owner's notice,
// the same ones the old agent uses, keyed on the turn's token so a retried job tells once. The facts the read settled are kept.
import type { ChatFacts } from "@travel-crm/contracts/ai";
import type { Database } from "@travel-crm/db";
import type { ChatRow } from "../may-write.js";
import { ATTENTION_QUIET_MS, tellOwner } from "../tell-owner.js";
import { REPEAT_ATTENTION } from "../repeats.js";
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
    /** The chat goes to a person: the AI stops answering it until the team gives it back. */
    handOver?: boolean;
  },
): Promise<void> {
  const { chat, code, now, organizationId } = input;
  const attention = `The AI could not answer safely (${code}): please answer this customer.`;
  const handedOff = input.handOver === true ? { handedOffAt: now, handoffReason: attention, followUpAt: null } : {};
  await db.forOrg(organizationId, async (tx) => {
    if (input.facts !== null) await saveFacts(tx, chat.id, input.facts);
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

/** What the read settled is kept even when nothing could be written, so the next turn knows what the customer said. */
export async function keepFacts(db: Database, organizationId: string, conversationId: string, facts: ChatFacts) {
  await db.forOrg(organizationId, (tx) => saveFacts(tx, conversationId, facts));
}

/** The old agent's note for a reply that only said again what was sent: kept facts, the attention fields, the owner told (not more than once in a while). */
export async function noteRepeat(
  db: Database,
  input: { organizationId: string; chat: ChatRow; token: string; facts: ChatFacts; now: Date },
): Promise<void> {
  const { chat, now, organizationId } = input;
  await db.forOrg(organizationId, async (tx) => {
    await saveFacts(tx, chat.id, input.facts);
    const before = await tx.aiChat.findFirstOrThrow({
      where: { conversationId: chat.id },
      select: { attentionAt: true },
    });
    await tx.aiChat.updateMany({
      where: { conversationId: chat.id },
      data: { attentionReason: REPEAT_ATTENTION, attentionAt: now },
    });
    if (before.attentionAt === null || now.getTime() - before.attentionAt.getTime() > ATTENTION_QUIET_MS) {
      await tellOwner(tx, organizationId, chat, {
        key: `ai-attention:${input.token}`,
        title: (name) => `${name}: ${REPEAT_ATTENTION}`.slice(0, 120),
        body: "The AI is still answering. Open the chat to join or take over.",
      });
    }
  });
}
