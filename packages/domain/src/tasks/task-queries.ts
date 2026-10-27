// One person's open tasks by due time (Today), as composable SQL (R11): the performance tests EXPLAIN the exact query
// the code runs, on task_open_by_assignee. Keyset paging on (due_at, id); never OFFSET.
import type { Task } from "@travel-crm/contracts/tasks";
import { emptySql, joinSql, sql, type OrgTx, type Sql } from "@travel-crm/db";
import { taskFromRow, type TaskRow } from "./task-record.js";

export interface OpenTasksFilter {
  assigneeUserId: string;
  /** Due at or after this instant. */
  dueFrom?: Date;
  /** Due before this instant. */
  dueBefore?: Date;
  /** The last task id of the previous page. */
  after?: string;
  limit: number;
}

const columns = sql`
  id, kind, title, due_at AS "dueAt", first_due_at AS "firstDueAt", assignee_user_id AS "assigneeUserId",
  record_type AS "recordType", record_id AS "recordId", done_at AS "doneAt", cancelled_at AS "cancelledAt"`;

function openTasksOfAssignee(filter: Pick<OpenTasksFilter, "assigneeUserId" | "dueFrom" | "dueBefore">): Sql {
  const conditions = [
    sql`assignee_user_id = ${filter.assigneeUserId}::uuid`,
    sql`done_at IS NULL`,
    sql`cancelled_at IS NULL`,
  ];
  if (filter.dueFrom !== undefined) conditions.push(sql`due_at >= ${filter.dueFrom}::timestamptz`);
  if (filter.dueBefore !== undefined) conditions.push(sql`due_at < ${filter.dueBefore}::timestamptz`);
  return joinSql(conditions, " AND ");
}

/** The page of open tasks the filter asks for, earliest due first. */
export function openTasksQuery(filter: OpenTasksFilter): Sql {
  const afterCursor =
    filter.after === undefined
      ? emptySql
      : sql`AND (due_at, id) > (SELECT previous.due_at, previous.id FROM task previous WHERE previous.id = ${filter.after}::uuid)`;
  return sql`
    SELECT ${columns} FROM task
    WHERE ${openTasksOfAssignee(filter)} ${afterCursor}
    ORDER BY due_at, id
    LIMIT ${filter.limit}`;
}

export async function listOpenTasks(tx: OrgTx, filter: OpenTasksFilter): Promise<Task[]> {
  const rows = await tx.$queryRaw<TaskRow[]>(openTasksQuery(filter));
  return rows.map(taskFromRow);
}

/** The count of the person's open tasks, within the window if one is given, as composable SQL (R11). */
export function countOpenTasksQuery(filter: Pick<OpenTasksFilter, "assigneeUserId" | "dueFrom" | "dueBefore">): Sql {
  return sql`SELECT count(*)::int AS n FROM task WHERE ${openTasksOfAssignee(filter)}`;
}

/** How many open tasks the person has, within the window if one is given. */
/** Open tasks past their time at `now`: one person's, or everyone's (null), for the dashboard. */
export async function countOverdueTasks(
  tx: OrgTx,
  { assigneeUserId, now }: { assigneeUserId: string | null; now: Date },
) {
  const assignee = assigneeUserId === null ? emptySql : sql`AND assignee_user_id = ${assigneeUserId}::uuid`;
  const [row] = await tx.$queryRaw<{ n: number }[]>(
    sql`SELECT count(*)::int AS n FROM task
      WHERE done_at IS NULL AND cancelled_at IS NULL AND due_at < ${now}::timestamptz ${assignee}`,
  );
  return row?.n ?? 0;
}

/** Each of these people's follow-ups and tasks past their time now: the team's missed follow-ups. */
export async function overdueByAssignee(
  tx: OrgTx,
  userIds: readonly string[],
  now: Date,
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx.task.groupBy({
    by: ["assigneeUserId"],
    where: { doneAt: null, cancelledAt: null, dueAt: { lt: now }, assigneeUserId: { in: [...userIds] } },
    _count: { _all: true },
  });
  return new Map(rows.flatMap((row) => (row.assigneeUserId === null ? [] : [[row.assigneeUserId, row._count._all]])));
}

export async function countOpenTasks(
  tx: OrgTx,
  filter: Pick<OpenTasksFilter, "assigneeUserId" | "dueFrom" | "dueBefore">,
): Promise<number> {
  const [row] = await tx.$queryRaw<{ n: number }[]>(countOpenTasksQuery(filter));
  return row?.n ?? 0;
}
