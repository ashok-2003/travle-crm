// Reads and saves a chat's facts (the grounded turn's memory between turns); a row that cannot be read counts as empty.
import { chatFacts, type ChatFacts } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";

export async function readFacts(tx: OrgTx, conversationId: string): Promise<ChatFacts> {
  const row = await tx.aiChat.findFirst({ where: { conversationId }, select: { facts: true } });
  const parsed = chatFacts.safeParse(row?.facts ?? {});
  return parsed.success ? parsed.data : chatFacts.parse({});
}

/** Saves the facts, making the chat's row if the AI has not touched this chat before. */
export async function saveFacts(tx: OrgTx, conversationId: string, facts: ChatFacts): Promise<void> {
  const organizationId = (
    await tx.whatsappConversation.findUniqueOrThrow({ where: { id: conversationId }, select: { organizationId: true } })
  ).organizationId;
  const data = chatFacts.parse(facts);
  await tx.aiChat.upsert({
    where: { organizationId_conversationId: { organizationId, conversationId } },
    create: { conversationId, facts: data },
    update: { facts: data },
  });
}
