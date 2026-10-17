// Reads of the tasks on records, for the modules above tasks, which never read the task table themselves: every task
// of some records, done and cancelled ones too (a customer's export before an erasure), and one person's open tasks on
// records of a type, a page at a time (a departing member's hand-over finds the closed leads that still hold work).
import type { Task } from "@travel-crm/contracts/tasks";
import type { OrgTx } from "@travel-crm/db";
import { openTask, taskColumns, taskFromRow } from "./task-record.js";

/** Every task on the records, open, done or cancelled, earliest due first. */
export async function listTasksOnRecord(tx: OrgTx, recordType: string, recordIds: readonly string[]): Promise<Task[]> {
  if (recordIds.length === 0) return [];
  const rows = await tx.task.findMany({
    where: { recordType, recordId: { in: [...recordIds] } },
    select: taskColumns,
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
  });
  return rows.map(taskFromRow);
}

export interface OpenRecordTasksFilter {
  assigneeUserId: string;
  recordType: string;
  /** The last task id of the previous page. */
  after?: string;
  limit: number;
}

/** One person's open tasks on records of a type, by id, a page after the cursor. */
export async function listOpenRecordTasksOf(tx: OrgTx, filter: OpenRecordTasksFilter): Promise<Task[]> {
  const rows = await tx.task.findMany({
    where: {
      assigneeUserId: filter.assigneeUserId,
      recordType: filter.recordType,
      ...openTask,
      ...(filter.after === undefined ? {} : { id: { gt: filter.after } }),
    },
    select: taskColumns,
    orderBy: { id: "asc" },
    take: filter.limit,
  });
  return rows.map(taskFromRow);
}
