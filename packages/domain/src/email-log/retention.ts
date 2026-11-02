// How long the email log keeps an email (the failed-emails spec): the rows hold working reset and invite links, so a
// sent email goes after 7 days and a failed one, which the console shows, after 30. A resend is kept as long as a
// failed email, so the email it copies still says how it went. An erased member's emails go at once.
import type { OrgTx } from "@travel-crm/db";
import { emailLogs } from "@travel-crm/db/email-log";

export const SENT_KEEP_DAYS = 7;
export const FAILED_KEEP_DAYS = 30;

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

/** Deletes the emails past their days, in a platform transaction; returns how many. */
export async function purgeEmailLog(tx: OrgTx, now: Date): Promise<number> {
  const { count } = await emailLogs(tx).deleteMany({
    where: {
      OR: [
        // Sending too: a send that never finished (its process stopped) has no outcome to wait for.
        { status: { in: ["sent", "sending"] }, resentFromId: null, createdAt: { lt: daysBefore(now, SENT_KEEP_DAYS) } },
        { createdAt: { lt: daysBefore(now, FAILED_KEEP_DAYS) } },
      ],
    },
  });
  return count;
}

/** Deletes every email to these addresses, whatever their case, in a platform transaction; returns how many. */
export async function deleteEmailsTo(tx: OrgTx, addresses: readonly string[]): Promise<number> {
  if (addresses.length === 0) return 0;
  const { count } = await emailLogs(tx).deleteMany({
    where: { OR: addresses.map((address) => ({ toAddress: { equals: address, mode: "insensitive" as const } })) },
  });
  return count;
}
