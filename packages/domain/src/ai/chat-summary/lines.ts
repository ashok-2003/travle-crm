// The messages after the summary's point: how many there are, and the newest of them as the summary model reads them.
import type { OrgTx } from "@travel-crm/db";
import { storedLineFields, storedLineOf } from "../natural/chat-lines.js";
import type { NaturalChatLine } from "../natural/types.js";

/** The summary is written afresh when more than this many messages follow its point. */
export const SUMMARY_AFTER = 30;
/** One refresh reads at most this many of the newest messages after the point. */
export const SUMMARY_MOST_LINES = 400;

/** What the customer could see after the point: no reactions, no discarded sends. */
const visibleAfter = (conversationId: string, after: Date | null) => ({
  conversationId,
  kind: { not: "reaction" },
  status: { not: "superseded" },
  ...(after === null ? {} : { occurredAt: { gt: after } }),
});

/** The newest `most` messages after the point, oldest first; the earlier system's lines whole, figures and dates kept. */
export async function linesAfter(
  tx: OrgTx,
  conversationId: string,
  after: Date | null,
  most: number = SUMMARY_MOST_LINES,
): Promise<NaturalChatLine[]> {
  const rows = await tx.whatsappMessage.findMany({
    where: visibleAfter(conversationId, after),
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: most,
    select: storedLineFields,
  });
  return rows.reverse().map((row) => storedLineOf(row, { earlierWhole: true }));
}

export function countAfter(tx: OrgTx, conversationId: string, after: Date | null): Promise<number> {
  return tx.whatsappMessage.count({ where: visibleAfter(conversationId, after) });
}
