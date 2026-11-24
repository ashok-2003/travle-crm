// The messages after the summary's point: how many there are, and the newest of them as the summary model reads them.
import type { OrgTx } from "@travel-crm/db";
import { storedLineFields, storedLineOf } from "../natural/chat-lines.js";
import type { NaturalChatLine } from "../natural/types.js";

/** The summary is written afresh when more than this many messages follow its point. */
export const SUMMARY_AFTER = 30;
/** One refresh reads at most this many of the newest messages after the point. */
export const SUMMARY_MOST_LINES = 400;

/** What the customer could see after the point: no reactions, no discarded sends. */
export interface SummaryPoint {
  at: Date;
  id: string;
}

/** Messages are ordered by (time, id); two sent in the same instant are told apart by id. */
const visibleAfter = (conversationId: string, after: SummaryPoint | null, before: SummaryPoint | null) => ({
  conversationId,
  kind: { not: "reaction" },
  status: { not: "superseded" },
  // Deleted for everyone: kept for the team, never read by the AI.
  revokedAt: null,
  AND: [
    ...(after === null
      ? []
      : [{ OR: [{ occurredAt: { gt: after.at } }, { occurredAt: after.at, id: { gt: after.id } }] }]),
    // The turn's own new lines stay out: a voice note or photo has no words yet, and the point must not pass it.
    ...(before === null
      ? []
      : [{ OR: [{ occurredAt: { lt: before.at } }, { occurredAt: before.at, id: { lt: before.id } }] }]),
  ],
});

/** The newest `most` messages after the point, oldest first; the earlier system's lines whole, figures and dates kept. */
export async function linesAfter(
  tx: OrgTx,
  conversationId: string,
  after: SummaryPoint | null,
  before: SummaryPoint | null = null,
  most: number = SUMMARY_MOST_LINES,
): Promise<{ lines: NaturalChatLine[]; senders: ReadonlyMap<string, string> }> {
  const rows = await tx.whatsappMessage.findMany({
    where: visibleAfter(conversationId, after, before),
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: most,
    select: storedLineFields,
  });
  const senders = new Map(
    rows.flatMap((row) => (row.direction === "out" && row.sentBy !== null ? [[row.id, row.sentBy] as const] : [])),
  );
  return { lines: rows.reverse().map((row) => storedLineOf(row, { earlierWhole: true })), senders };
}

export function countAfter(
  tx: OrgTx,
  conversationId: string,
  after: SummaryPoint | null,
  before: SummaryPoint | null = null,
): Promise<number> {
  return tx.whatsappMessage.count({ where: visibleAfter(conversationId, after, before) });
}
