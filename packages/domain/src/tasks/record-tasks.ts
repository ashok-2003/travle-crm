// A record's open tasks, changed together: a lost lead's are cancelled (R29), a reassigned lead's follow its owner
// (R21), and a departing member's standalone tasks go to the agency's Owner (R37). Done tasks stay as they were.
import type { Task } from "@travel-crm/contracts/tasks";
import { emptySql, sql, type OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { auditTask } from "./task-changes.js";
import { openTask, taskColumns, taskFromRow, type TaskRecordLink } from "./task-record.js";

/** Cancels every open task on the record, and returns them. */
export async function cancelOpenTasks(tx: OrgTx, actor: Actor, record: TaskRecordLink, now: Date): Promise<Task[]> {
  const rows = await tx.task.updateManyAndReturn({
    where: { ...record, ...openTask },
    data: { cancelledAt: now },
    select: taskColumns,
  });
  const cancelled = rows.map(taskFromRow);
  for (const task of cancelled) await auditTask(tx, actor, "task.cancelled", task);
  return cancelled;
}

/**
 * Closes these tasks if they are still open: done (the work was finished by another route, with the actor named) or
 * cancelled (it no longer applies). Closed ones are left as they are, so a repeat changes nothing. Returns those closed.
 */
export async function finishTasks(
  tx: OrgTx,
  actor: Actor,
  taskIds: readonly (string | null)[],
  how: "done" | "cancelled",
  now: Date,
): Promise<Task[]> {
  const ids = taskIds.filter((id): id is string => id !== null);
  if (ids.length === 0) return [];
  const rows = await tx.task.updateManyAndReturn({
    where: { id: { in: ids }, ...openTask },
    data:
      how === "done"
        ? { doneAt: now, ...(actor.userId === null ? {} : { doneBy: actor.userId }) }
        : { cancelledAt: now },
    select: taskColumns,
  });
  const closed = rows.map(taskFromRow);
  for (const task of closed) await auditTask(tx, actor, how === "done" ? "task.done" : "task.cancelled", task);
  return closed;
}

/** Makes an open task due now when it is due later, so a snoozed task reads overdue again. True when it moved. */
export async function bringTaskForward(tx: OrgTx, actor: Actor, taskId: string, now: Date): Promise<boolean> {
  const [moved] = await tx.task.updateManyAndReturn({
    where: { id: taskId, ...openTask, dueAt: { gt: now } },
    data: { dueAt: now },
    select: taskColumns,
  });
  if (moved === undefined) return false;
  await auditTask(tx, actor, "task.snoozed", taskFromRow(moved));
  return true;
}

/** Gives every open task on the record to one person (or nobody), and returns those that moved. */
export async function reassignOpenTasks(
  tx: OrgTx,
  actor: Actor,
  record: TaskRecordLink,
  assigneeUserId: string | null,
): Promise<Task[]> {
  // Written out, since a plain "not this person" would skip tasks with nobody assigned.
  const elsewhere =
    assigneeUserId === null
      ? { assigneeUserId: { not: null } }
      : { OR: [{ assigneeUserId: null }, { assigneeUserId: { not: assigneeUserId } }] };
  const others = await tx.task.findMany({ where: { ...record, ...openTask, ...elsewhere }, select: taskColumns });
  return moveTasks(tx, actor, others.map(taskFromRow), assigneeUserId);
}

/**
 * Gives one person's open standalone tasks to another, `limit` at most; returns how many moved. The tasks are locked
 * as they are chosen (FOR UPDATE): Postgres checks the condition again on a task another transaction was changing, so
 * one reassigned or finished meanwhile no longer matches and keeps that change.
 */
export async function reassignOpenStandaloneTasks(
  tx: OrgTx,
  actor: Actor,
  handOver: { fromUserId: string; toUserId: string; limit?: number },
): Promise<number> {
  const limit = handOver.limit === undefined ? emptySql : sql`LIMIT ${handOver.limit}`;
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM task
    WHERE assignee_user_id = ${handOver.fromUserId}::uuid AND record_type IS NULL
      AND done_at IS NULL AND cancelled_at IS NULL
    ORDER BY id ${limit}
    FOR UPDATE`;
  if (locked.length === 0) return 0;
  const theirs = await tx.task.findMany({
    where: { id: { in: locked.map((task) => task.id) } },
    select: taskColumns,
    orderBy: { id: "asc" },
  });
  return (await moveTasks(tx, actor, theirs.map(taskFromRow), handOver.toUserId)).length;
}

async function moveTasks(tx: OrgTx, actor: Actor, tasks: Task[], assigneeUserId: string | null): Promise<Task[]> {
  if (tasks.length === 0) return [];
  const before = new Map(tasks.map((task) => [task.id, task.assigneeUserId]));
  const rows = await tx.task.updateManyAndReturn({
    where: { id: { in: [...before.keys()] }, ...openTask },
    data: { assigneeUserId },
    select: taskColumns,
  });
  const moved = rows.map(taskFromRow);
  for (const task of moved) {
    await auditTask(tx, actor, "task.reassigned", task, { assigneeUserId: before.get(task.id) ?? null });
  }
  return moved;
}

/** The record's open tasks, earliest due first. */
export async function openTasksOf(tx: OrgTx, record: TaskRecordLink): Promise<Task[]> {
  const rows = await tx.task.findMany({
    where: { ...record, ...openTask },
    select: taskColumns,
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
  });
  return rows.map(taskFromRow);
}

/** Each record's earliest open task, by record id; records with none are left out. */
export async function nextOpenTasks(
  tx: OrgTx,
  recordType: string,
  recordIds: readonly string[],
): Promise<Map<string, Task>> {
  const next = new Map<string, Task>();
  if (recordIds.length === 0) return next;
  const rows = await tx.task.findMany({
    where: { recordType, recordId: { in: [...recordIds] }, ...openTask },
    select: taskColumns,
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
  });
  for (const row of rows) {
    if (row.recordId !== null && !next.has(row.recordId)) next.set(row.recordId, taskFromRow(row));
  }
  return next;
}
