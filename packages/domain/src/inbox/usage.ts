// What a connection sent and received this month, by kind (spec 5): incremented in the message's own transaction, read by the
// console's fair-use view and the marketing cap. The month is the first day in the organization's time zone.
import type { OrgTx } from "@travel-crm/db";

export type UsageCounts = Partial<{
  inbound: number;
  replies: number;
  utility: number;
  marketing: number;
  failed: number;
  mediaBytesCopied: number;
}>;

/** The first day of `now`'s month in `timeZone`, as the date column holds it (UTC midnight). */
export function monthStartOf(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return new Date(`${year}-${month}-01T00:00:00Z`);
}

/** Adds to the month's counts, making the row when it is the month's first. */
export async function bumpUsage(
  tx: OrgTx,
  scope: { organizationId: string; connectionId: string },
  month: Date,
  counts: UsageCounts,
): Promise<void> {
  const { inbound = 0, replies = 0, utility = 0, marketing = 0, failed = 0, mediaBytesCopied = 0 } = counts;
  await tx.whatsappUsageMonth.upsert({
    where: { organizationId_connectionId_month: { ...scope, month } },
    create: { connectionId: scope.connectionId, month, inbound, replies, utility, marketing, failed, mediaBytesCopied },
    update: {
      inbound: { increment: inbound },
      replies: { increment: replies },
      utility: { increment: utility },
      marketing: { increment: marketing },
      failed: { increment: failed },
      mediaBytesCopied: { increment: mediaBytesCopied },
    },
  });
}
