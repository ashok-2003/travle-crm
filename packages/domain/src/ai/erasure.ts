// What the AI keeps about a person: the drafts made in their chats (ids and a hash of the words, never the words) and its
// guess of how their leads would go. Deleted when the customer is erased, run on the platform's transaction.
import type { OrgTx } from "@travel-crm/db";

export async function withdrawAiParts(
  tx: OrgTx,
  input: { organizationId: string; personId: string },
): Promise<{ drafts: number; insights: number }> {
  const drafts = await tx.aiDraft.deleteMany({
    where: { organizationId: input.organizationId, conversation: { personId: input.personId } },
  });
  const insights = await tx.leadAiInsight.deleteMany({
    where: { organizationId: input.organizationId, lead: { personId: input.personId } },
  });
  return { drafts: drafts.count, insights: insights.count };
}
