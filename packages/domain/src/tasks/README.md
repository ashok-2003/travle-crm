# tasks

Follow-ups and tasks on any record, or standing alone (spec 3.5, 6; layer L0). A task points at a record by
`record_type` and `record_id`, as attachments do; a follow-up always does. Tasks are never deleted: they end done or
cancelled (R9). Times picked on the agency's clock (`wallClockTime`) become instants in its zone (R25).

## Who reaches a task

A member reaches the tasks assigned to them, or everyone's with `leads:view` over all records:
`scopeFilter(access, "leads:view", "assigneeUserId")` (R21). Any other is `NOT_FOUND`. A lead's tasks are always its
owner's: the crm module moves them with the lead.

## Public functions (`index.ts`)

- `createTask(tx, actor, { kind, title, dueAt, assigneeUserId, record })`: adds one as given; the caller has checked
  who may give it to whom.
- `addStandaloneTask(tx, access, { title, due, assigneeUserId }, { owners, now })`: yours, or with `leads:assign`
  someone else's who can work leads (`owners`, from identity's `leadWorkers`): `MISSING_PERMISSION`,
  `NOT_A_LEAD_WORKER`.
- `dueInstant(tx, organizationId, due, now)`: the instant a picked day and time mean in the agency's zone; one before
  the current minute is `DUE_IN_THE_PAST`.
- `completeTask(tx, access, taskId, now)`: once; a second Done (a stale tab) is `TASK_CLOSED` and records nothing.
- `snoozeTask(tx, access, { taskId, until }, now)`: an hour on, tomorrow at 09:00 on the agency's clock, or a chosen
  time. The first due time stays. A closed task is `TASK_CLOSED`.
- `cancelOpenTasks(tx, actor, record, now)` and `reassignOpenTasks(tx, actor, record, assigneeUserId)`: a record's
  open tasks, together; done ones stay. They return the tasks changed.
- `reassignOpenStandaloneTasks(tx, actor, { fromUserId, toUserId, limit? })`: a departing member's standalone tasks;
  returns how many moved.
- `openTasksOf(tx, record)` (earliest due first) and `nextOpenTasks(tx, recordType, recordIds)` (each record's
  earliest open task).
- `openTasksQuery(filter)` (composable SQL, R11), `listOpenTasks(tx, filter)` and `countOpenTasks(tx, filter)`: one
  person's open tasks by due time, within `dueFrom`/`dueBefore`, a page `after` a task id (keyset on due time and id).
- `listTasksOnRecord(tx, recordType, recordIds)`: every task on the records, done and cancelled ones too, earliest
  due first (a customer's export).
- `listOpenRecordTasksOf(tx, { assigneeUserId, recordType, after?, limit })`: one person's open tasks on records of a
  type, by id, a page after a task id (a departing member's hand-over).
- `redactTaskTitles(tx, { organizationId, recordType, recordIds })`: an erasure's; empties the titles.

Modules above call these functions and never read the task table themselves.

## Audit and events

`task.added`, `task.done`, `task.snoozed`, `task.cancelled` and `task.reassigned`, each an audit action and an event
(`{ taskId }`). Audit snapshots hold the kind, due time, assignee and record type, never the title (R28).
