// The autopilot's last day at a glance (the AI screen's head): chats it answered and messages it sent, how fast it answered
// (the middle time from a customer's message to its reply: a reply's token names the message it answers), chats it flagged
// or handed over, follow-ups it has planned, and its lessons.
import type { AiOverview } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";

const DAY_MS = 86_400_000;
/** A reply's token is "ai:<the customer's message id>"; a nudge's is "ai:nudge:…". */
const REPLY_TOKEN = /^ai:([0-9a-f-]{36})$/;

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
};

export async function aiOverviewOf(tx: OrgTx, now: Date): Promise<AiOverview> {
  const since = new Date(now.getTime() - DAY_MS);
  const sent = await tx.whatsappMessage.findMany({
    where: { direction: "out", clientToken: { startsWith: "ai:" }, occurredAt: { gte: since } },
    select: { conversationId: true, clientToken: true, occurredAt: true },
    take: 2000,
  });
  const answered = new Map<string, Date>();
  for (const message of sent) {
    const match = REPLY_TOKEN.exec(message.clientToken ?? "");
    if (match?.[1] !== undefined) answered.set(match[1], message.occurredAt);
  }
  const asked = await tx.whatsappMessage.findMany({
    where: { id: { in: [...answered.keys()].slice(0, 500) } },
    select: { id: true, occurredAt: true },
  });
  const seconds = asked.flatMap((message) => {
    const reply = answered.get(message.id);
    return reply === undefined
      ? []
      : [Math.max(0, Math.round((reply.getTime() - message.occurredAt.getTime()) / 1000))];
  });
  return {
    chatsAnswered: new Set(sent.map((message) => message.conversationId)).size,
    messagesSent: sent.length,
    medianReplySeconds: median(seconds),
    flagged: await tx.aiChat.count({
      where: { OR: [{ attentionAt: { gte: since } }, { handedOffAt: { gte: since } }] },
    }),
    followUpsPlanned: await tx.aiChat.count({ where: { followUpAt: { gt: now } } }),
    learnings: await tx.aiLearning.count({ where: { state: "active" } }),
  };
}
