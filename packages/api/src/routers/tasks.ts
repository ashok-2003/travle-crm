// tasks.*: standalone tasks, and Done and Snooze on any follow-up or task (spec 3.5). All need leads:view (R20); a
// task for someone else needs leads:assign, which the domain checks. Done on a lead's task also writes "follow-up done"
// on the lead's timeline, in the same transaction (R22): tasks sits below crm, so the router calls both.
import { addTaskInput, snoozeTaskInput, task, taskIdInput } from "@travel-crm/contracts/tasks";
import { recordLeadEvent } from "@travel-crm/domain/crm";
import { addStandaloneTask, completeTask, snoozeTask } from "@travel-crm/domain/tasks";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";
import { leadWorkerIds } from "../lead-workers.js";

const worker = orgProcedure.requires("leads:view");

export const tasksRouter = router({
  /** A task standing alone: yours, or with leads:assign someone else's who can work leads. */
  add: worker
    .input(addTaskInput)
    .output(task)
    .mutation(async ({ ctx, input }) => {
      const owners = await leadWorkerIds(ctx.identity, ctx.member, input.assigneeUserId);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        addStandaloneTask(tx, ctx.member, input, { owners, now: new Date() }),
      );
    }),

  /** Done, once; a second Done is TASK_CLOSED. */
  complete: worker
    .input(taskIdInput)
    .output(task)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
        const now = new Date();
        const done = await completeTask(tx, ctx.member, input.taskId, now);
        if (done.record?.recordType === "lead") {
          const record = { recordType: "task", recordId: done.id } as const;
          await recordLeadEvent(tx, ctx.member, {
            leadId: done.record.recordId,
            kind: "follow-up-done",
            record,
            occurredAt: now,
          });
        }
        return done;
      }),
    ),

  /** An hour on, tomorrow at 09:00 on the agency's clock, or a chosen time. */
  snooze: worker
    .input(snoozeTaskInput)
    .output(task)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => snoozeTask(tx, ctx.member, input, new Date())),
    ),
});
