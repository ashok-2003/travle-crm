// What the AI keeps about a person: the drafts made in their chats (ids and a hash of the words, never the words), its
// guess of how their leads would go, the bookings it took on them (travellers' names and dates), the autopilot's state and memory of their chats, and the lessons learned from the
// agency's chats (general, with numbers and emails taken out, but drawn from theirs among others, so they go too: the AI
// learns again from the chats that remain). Deleted when the customer is erased, run on the platform's transaction.
import type { OrgTx } from "@travel-crm/db";

export async function withdrawAiParts(
  tx: OrgTx,
  input: {
    organizationId: string;
    personId: string;
    /** Their numbers: a chat stored with no person is found by them. */ phones?: readonly string[];
  },
): Promise<{ drafts: number; insights: number; chats: number; lessons: number; bookings: number }> {
  const conversation = {
    OR: [
      { personId: input.personId },
      ...((input.phones?.length ?? 0) > 0 ? [{ phoneE164: { in: [...(input.phones ?? [])] } }] : []),
    ],
  };
  const drafts = await tx.aiDraft.deleteMany({ where: { organizationId: input.organizationId, conversation } });
  const chats = await tx.aiChat.deleteMany({ where: { organizationId: input.organizationId, conversation } });
  const lessons = await tx.aiLearning.deleteMany({ where: { organizationId: input.organizationId } });
  const insights = await tx.leadAiInsight.deleteMany({
    where: { organizationId: input.organizationId, lead: { personId: input.personId } },
  });
  const bookings = await tx.aiBooking.deleteMany({
    where: { organizationId: input.organizationId, lead: { personId: input.personId } },
  });
  return {
    drafts: drafts.count,
    insights: insights.count,
    chats: chats.count,
    lessons: lessons.count,
    bookings: bookings.count,
  };
}
