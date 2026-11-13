// The AI agent's last day at a glance (the AI agent page's head): chats it answered and messages it sent, chats it flagged
// or handed over, and bookings it took.
import type { AiOverview } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";

const DAY_MS = 86_400_000;
/** A bound on each read of flagged chats: far above a day's real number, so the count stays cheap. */
const FLAGGED_MAX = 2000;

/**
 * The chats the AI flagged for a person since then, each once: handed over, told the team while it kept answering, or its
 * lead suggested Lost or Not a lead. Whatever the reason: a hand-over's reasons change, the count does not.
 */
async function flaggedChats(tx: OrgTx, since: Date): Promise<number> {
  const chats = await tx.aiChat.findMany({
    where: { OR: [{ attentionAt: { gte: since } }, { handedOffAt: { gte: since } }] },
    distinct: ["conversationId"],
    select: { conversationId: true },
    take: FLAGGED_MAX,
  });
  const suggested = await tx.leadAiSuggestion.findMany({
    where: { createdAt: { gte: since } },
    distinct: ["conversationId", "leadId"],
    select: { conversationId: true, leadId: true },
    take: FLAGGED_MAX,
  });
  // A suggestion with no chat counts by its lead, as an item of its own.
  const keys = [
    ...chats.map((row) => row.conversationId),
    ...suggested.map((row) => row.conversationId ?? `lead:${row.leadId}`),
  ];
  return new Set(keys).size;
}

export async function aiOverviewOf(tx: OrgTx, now: Date): Promise<AiOverview> {
  const since = new Date(now.getTime() - DAY_MS);
  const sent = await tx.whatsappMessage.findMany({
    where: { direction: "out", clientToken: { startsWith: "ai:" }, occurredAt: { gte: since } },
    select: { conversationId: true },
    take: 2000,
  });
  return {
    chatsAnswered: new Set(sent.map((message) => message.conversationId)).size,
    messagesSent: sent.length,
    flagged: await flaggedChats(tx, since),
    bookingsRequested: await tx.aiBooking.count({ where: { createdAt: { gte: since } } }),
  };
}
