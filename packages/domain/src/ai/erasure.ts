// What the AI keeps about a person: the drafts made in their chats (ids and a hash of the words, never the words) and its
// guess of how their leads would go. Deleted when the customer is erased, run on the platform's transaction.
import type { OrgTx } from "@travel-crm/db";

export async function withdrawAiParts(
  tx: OrgTx,
  input: {
    organizationId: string;
    personId: string;
    /** Their numbers: a chat stored with no person is found by them. */ phones?: readonly string[];
  },
): Promise<{ drafts: number; insights: number }> {
  const drafts = await tx.aiDraft.deleteMany({
    where: {
      organizationId: input.organizationId,
      conversation: {
        OR: [
          { personId: input.personId },
          ...((input.phones?.length ?? 0) > 0 ? [{ phoneE164: { in: [...(input.phones ?? [])] } }] : []),
        ],
      },
    },
  });
  const insights = await tx.leadAiInsight.deleteMany({
    where: { organizationId: input.organizationId, lead: { personId: input.personId } },
  });
  return { drafts: drafts.count, insights: insights.count };
}
