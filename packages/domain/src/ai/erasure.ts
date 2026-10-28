// What the AI keeps about a person: the drafts made in their chats (ids and a hash of the words, never the words). Deleted when
// the customer is erased, run on the platform's transaction.
import type { OrgTx } from "@travel-crm/db";

export async function withdrawAiDrafts(
  tx: OrgTx,
  input: { organizationId: string; personId: string },
): Promise<{ drafts: number }> {
  const drafts = await tx.aiDraft.deleteMany({
    where: { organizationId: input.organizationId, conversation: { personId: input.personId } },
  });
  return { drafts: drafts.count };
}
