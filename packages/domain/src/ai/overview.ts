// The AI agent's last day at a glance (the AI agent page's head): chats it answered and messages it sent, chats it flagged
// or handed over, and bookings it took.
import type { AiOverview } from "@travel-crm/contracts/ai";
import { emptySql, sql, type OrgTx } from "@travel-crm/db";
import { answeredByAiWhere } from "../inbox/index.js";

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

/**
 * The chats the AI wrote in since an instant (all time for null), each once, counted in SQL so no row cap bends it.
 * The AI's messages are the ones whose client token starts "ai:".
 */
export async function chatsAnsweredSince(tx: OrgTx, since: Date | null): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>(sql`
    SELECT count(DISTINCT conversation_id)::int AS n
    FROM whatsapp_message
    WHERE direction = 'out' AND client_token LIKE 'ai:%'
      ${since === null ? emptySql : sql`AND occurred_at >= ${since}::timestamptz`}`);
  return rows[0]?.n ?? 0;
}

export async function aiOverviewOf(tx: OrgTx, now: Date): Promise<AiOverview> {
  const since = new Date(now.getTime() - DAY_MS);
  const sent = await tx.whatsappMessage.findMany({
    where: { direction: "out", clientToken: { startsWith: "ai:" }, occurredAt: { gte: since } },
    select: { id: true },
    take: 2000,
  });
  return {
    // The inbox's Answered by the AI filter lists exactly these.
    chatsAnswered: await tx.whatsappConversation.count({ where: answeredByAiWhere(now) }),
    messagesSent: sent.length,
    flagged: await flaggedChats(tx, since),
    bookingsRequested: await tx.aiBooking.count({ where: { createdAt: { gte: since } } }),
  };
}
