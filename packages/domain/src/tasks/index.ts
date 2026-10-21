// Public API of the tasks module: follow-ups and tasks on any record, or standing alone (spec 6, L0).
export { redactTaskTitles } from "./erasure.js";
export {
  cancelOpenTasks,
  nextOpenTasks,
  openTasksOf,
  reassignOpenStandaloneTasks,
  reassignOpenTasks,
} from "./record-tasks.js";
export { listOpenRecordTasksOf, listTasksOnRecord, type OpenRecordTasksFilter } from "./record-task-reads.js";
export { addStandaloneTask, completeTask, createTask, dueInstant, snoozeTask } from "./task-changes.js";
export {
  countOpenTasks,
  countOpenTasksQuery,
  countOverdueTasks,
  listOpenTasks,
  openTasksQuery,
  type OpenTasksFilter,
} from "./task-queries.js";
export type { TaskRecordLink } from "./task-record.js";
