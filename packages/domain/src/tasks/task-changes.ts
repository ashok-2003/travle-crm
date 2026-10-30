// Adding, finishing, snoozing and changing follow-ups and tasks (spec 3.5, 4). Times picked on the agency's clock become
// instants in its zone (R25); a time that has passed is refused. A member reaches the tasks assigned to them, or
// everyone's with leads:view over all records (R21); any other is "not found". Each change is audited without the
// title (R28) and publishes an event of the same name.
import type { AddTaskInput, EditTaskInput, SnoozeTaskInput, Task, TaskKind } from "@travel-crm/contracts/tasks";
import type { WallClockTime } from "@travel-crm/contracts/kernel";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit, type AuditSnapshot } from "../audit/index.js";
import { organizationTimeZone, scopeFilter, type MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import {
  addDays,
  calendarDateIn,
  DomainError,
  instantAt,
  parseCalendarDate,
  parseTimeOfDay,
  type Actor,
} from "../kernel/index.js";
import { openTask, taskColumns, taskFromRow, type TaskRecordLink } from "./task-record.js";

const HOUR_MS = 60 * 60 * 1000;
const MORNING = parseTimeOfDay("09:00");

/** Records a change to a task, without its title, and publishes the event of the same name. */
export async function auditTask(
  tx: OrgTx,
  actor: Actor,
  action: "task.added" | "task.done" | "task.snoozed" | "task.edited" | "task.cancelled" | "task.reassigned",
  task: Task,
  before?: AuditSnapshot,
): Promise<void> {
  await recordAudit(tx, actor, {
    action,
    entityType: "task",
    entityId: task.id,
    ...(before ? { before } : {}),
    after: {
      kind: task.kind,
      dueAt: task.dueAt,
      assigneeUserId: task.assigneeUserId,
      recordType: task.record?.recordType ?? null,
    },
  });
  await publishEvent(tx, { type: action, payload: { taskId: task.id } });
}

/** The instant a day and time on the agency's clock mean; one before the current minute is refused. */
export async function dueInstant(tx: OrgTx, organizationId: string, due: WallClockTime, now: Date): Promise<Date> {
  const timeZone = await organizationTimeZone(tx, organizationId);
  const dueAt = instantAt(parseCalendarDate(due.on), parseTimeOfDay(due.at), timeZone);
  if (dueAt.getTime() < now.getTime() - (now.getTime() % 60_000)) {
    throw new DomainError("VALIDATION", "DUE_IN_THE_PAST", "That time has passed");
  }
  return dueAt;
}

/** Adds a follow-up or task as it is given: the caller has checked who may give it to whom. */
export async function createTask(
  tx: OrgTx,
  actor: Actor,
  task: {
    kind: TaskKind;
    title: string;
    dueAt: Date;
    assigneeUserId: string | null;
    record: TaskRecordLink | null;
    /** Added by the AI from a chat. */
    byAi?: boolean;
  },
): Promise<Task> {
  const created = taskFromRow(
    await tx.task.create({
      data: {
        kind: task.kind,
        title: task.title,
        dueAt: task.dueAt,
        firstDueAt: task.dueAt,
        assigneeUserId: task.assigneeUserId,
        recordType: task.record?.recordType ?? null,
        recordId: task.record?.recordId ?? null,
        createdBy: actor.userId,
        byAi: task.byAi ?? false,
      },
      select: taskColumns,
    }),
  );
  await auditTask(tx, actor, "task.added", created);
  return created;
}

/**
 * A task standing alone, for yourself or, with leads:assign, for someone who can work leads (`owners`, from
 * identity's leadWorkers).
 */
export async function addStandaloneTask(
  tx: OrgTx,
  access: MemberAccess,
  input: AddTaskInput,
  context: { owners: ReadonlySet<string>; now: Date },
): Promise<Task> {
  const assigneeUserId = input.assigneeUserId ?? access.userId;
  if (assigneeUserId !== access.userId) {
    if (!access.permissions.has("leads:assign")) {
      throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires leads:assign");
    }
    if (!context.owners.has(assigneeUserId)) {
      throw new DomainError("VALIDATION", "NOT_A_LEAD_WORKER", "That person can't work leads");
    }
  }
  const dueAt = await dueInstant(tx, access.organizationId, input.due, context.now);
  return createTask(tx, access, { kind: "task", title: input.title, dueAt, assigneeUserId, record: null });
}

/** An open task the member may reach; a closed one is TASK_CLOSED, one out of reach NOT_FOUND. */
async function openTaskInScope(tx: OrgTx, access: MemberAccess, taskId: string) {
  const task = await tx.task.findFirst({
    where: { id: taskId, ...scopeFilter(access, "leads:view", "assigneeUserId") },
    select: taskColumns,
  });
  if (task === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such task");
  if (task.doneAt !== null || task.cancelledAt !== null) {
    throw new DomainError("CONFLICT", "TASK_CLOSED", "This task is already done or cancelled");
  }
  return task;
}

/** Changes an open task, or refuses as closed when another tab closed it first. */
async function updateOpenTask(
  tx: OrgTx,
  taskId: string,
  data: { doneAt?: Date; doneBy?: string; dueAt?: Date; title?: string },
) {
  const [updated] = await tx.task.updateManyAndReturn({
    where: { id: taskId, ...openTask },
    data,
    select: taskColumns,
  });
  if (updated === undefined) throw new DomainError("CONFLICT", "TASK_CLOSED", "This task is already done or cancelled");
  return taskFromRow(updated);
}

/** Marks a task done, once: a second Done, from a stale tab, is TASK_CLOSED and records nothing. */
export async function completeTask(tx: OrgTx, access: MemberAccess, taskId: string, now: Date): Promise<Task> {
  await openTaskInScope(tx, access, taskId);
  const done = await updateOpenTask(tx, taskId, { doneAt: now, doneBy: access.userId });
  await auditTask(tx, access, "task.done", done);
  return done;
}

/** Moves an open task's due time: an hour on, tomorrow at 09:00 on the agency's clock, or a chosen time. */
export async function snoozeTask(tx: OrgTx, access: MemberAccess, input: SnoozeTaskInput, now: Date): Promise<Task> {
  const task = await openTaskInScope(tx, access, input.taskId);
  const { until } = input;
  let dueAt: Date;
  if (until.choice === "one-hour") {
    dueAt = new Date(now.getTime() + HOUR_MS);
  } else if (until.choice === "tomorrow-morning") {
    const timeZone = await organizationTimeZone(tx, access.organizationId);
    dueAt = instantAt(addDays(calendarDateIn(now, timeZone), 1), MORNING, timeZone);
  } else {
    dueAt = await dueInstant(tx, access.organizationId, until.due, now);
  }
  const snoozed = await updateOpenTask(tx, input.taskId, { dueAt });
  await auditTask(tx, access, "task.snoozed", snoozed, { dueAt: task.dueAt.toISOString() });
  return snoozed;
}

/** Changes what an open task asks and when it is due (the Follow-ups screen); a time already past is refused. */
export async function editTask(tx: OrgTx, access: MemberAccess, input: EditTaskInput, now: Date): Promise<Task> {
  const task = await openTaskInScope(tx, access, input.taskId);
  const dueAt = await dueInstant(tx, access.organizationId, input.due, now);
  const edited = await updateOpenTask(tx, input.taskId, { title: input.title, dueAt });
  await auditTask(tx, access, "task.edited", edited, { dueAt: task.dueAt.toISOString() });
  return edited;
}
