// A task as the module hands it out (the contracts' Task, times in ISO), read from its row, and the record a task is
// about. Rows come from Prisma or from the composed queries, which name their columns the same way.
import { taskKind, type Task } from "@travel-crm/contracts/tasks";

/** The record a task is about, e.g. { recordType: "lead", recordId }. */
export interface TaskRecordLink {
  recordType: string;
  recordId: string;
}

/** The task columns every read selects. */
export const taskColumns = {
  id: true,
  kind: true,
  title: true,
  dueAt: true,
  firstDueAt: true,
  assigneeUserId: true,
  recordType: true,
  recordId: true,
  doneAt: true,
  cancelledAt: true,
} as const;

export interface TaskRow {
  id: string;
  kind: string;
  title: string;
  dueAt: Date;
  firstDueAt: Date;
  assigneeUserId: string | null;
  recordType: string | null;
  recordId: string | null;
  doneAt: Date | null;
  cancelledAt: Date | null;
}

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    kind: taskKind.parse(row.kind),
    title: row.title,
    dueAt: row.dueAt.toISOString(),
    firstDueAt: row.firstDueAt.toISOString(),
    assigneeUserId: row.assigneeUserId,
    record:
      row.recordType !== null && row.recordId !== null ? { recordType: row.recordType, recordId: row.recordId } : null,
    doneAt: row.doneAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}

/** Where-clause fragment for open tasks: neither done nor cancelled. */
export const openTask = { doneAt: null, cancelledAt: null } as const;
