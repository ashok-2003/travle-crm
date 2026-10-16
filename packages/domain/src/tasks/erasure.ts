// Erasing a customer (ADR 0023, R38): their records' task titles may name them ("Ask Rahul for passports"), so the
// titles are emptied; the tasks stay, done or not, for the counts. Run by the platform's erasure.
import type { OrgTx } from "@travel-crm/db";

/** Empties the titles of every task on these records, and says how many there were. */
export async function redactTaskTitles(
  tx: OrgTx,
  records: { organizationId: string; recordType: string; recordIds: readonly string[] },
): Promise<number> {
  if (records.recordIds.length === 0) return 0;
  const { count } = await tx.task.updateMany({
    where: {
      organizationId: records.organizationId,
      recordType: records.recordType,
      recordId: { in: [...records.recordIds] },
    },
    data: { title: "" },
  });
  return count;
}
