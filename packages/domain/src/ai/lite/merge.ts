// The chat's lite facts (the earlier agent's memory between turns): read, and kept only for the lead they were about.
import { liteFacts, type LiteFacts } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";

/**
 * The facts for the chat's open lead (`leadId`, null for none). Facts settled for another lead, one since closed or
 * another opened, are a past trip's: the trip starts afresh, keeping only who the customer is and how they write (the
 * name, the language, a name they would not give) and the last move. Facts settled before any lead are this enquiry's,
 * and are kept for the lead it gets.
 */
export function factsForLead(facts: LiteFacts, leadId: string | null): LiteFacts {
  if (facts.leadId === null || facts.leadId === leadId) return { ...facts, leadId };
  const { name, language, nameSkipped, lastMove } = facts;
  return liteFacts.parse({ agent: "lite", name, language, nameSkipped, lastMove, leadId });
}

/** A row that is missing, grounded or unreadable reads as empty lite facts. */
export async function readLiteFacts(tx: OrgTx, conversationId: string): Promise<LiteFacts> {
  const row = await tx.aiChat.findFirst({ where: { conversationId }, select: { facts: true } });
  const parsed = liteFacts.safeParse(row?.facts ?? {});
  return parsed.success ? parsed.data : liteFacts.parse({ agent: "lite" });
}
