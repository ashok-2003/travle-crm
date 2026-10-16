// When someone leaves (spec 4, R15, R37): on staff.removed their open leads, each with its open tasks, then the closed
// leads that still hold open tasks of theirs (a Won lead keeps its follow-ups, which would otherwise sit in nobody's
// Today), then their open standalone tasks go to the agency's Owner, as the system's change (audit log and timeline),
// telling nobody; managers reassign from there. A listener's transaction has 5 seconds, so the work goes 50 at a time,
// each batch in its own transaction; what a batch moved is no longer the member's, so a repeat or a retry after a crash
// moves only what is left. Other closed leads stay with the member, as do finished tasks.
import { openLeadStages } from "@travel-crm/contracts/crm";
import { staffRemovedEvent } from "@travel-crm/contracts/identity";
import { joinSql, sql, type OrgTx, type Sql } from "@travel-crm/db";
import { ownMessage } from "@travel-crm/integrations/jobs";
import type { Actor } from "../kernel/index.js";
import { defineListener, type EventListener, type ListenerContext } from "../jobs/index.js";
import { listOpenRecordTasksOf, reassignOpenStandaloneTasks } from "../tasks/index.js";
import { changeLeadOwner } from "./lead-core.js";

/**
 * Leads, or tasks, handled in one transaction. Each loop runs until a batch selects nothing: a batch that comes back
 * short may still leave work, since FOR UPDATE drops a row a concurrent change made stop matching, and a row that
 * started matching meanwhile wasn't in the batch's snapshot.
 *
 * The size is not R37's 200: under a loaded database one batch of 200 ran past the 5 seconds, and a batch that can't
 * finish fails again on every retry; 50 leads take about a fifth of a second on a quiet one.
 */
const HAND_OVER_BATCH = 50;

export interface DepartingMemberDependencies {
  /** The agency's Owner who takes the work: the earliest-joined active Owner (identity's firstOwner, R15). */
  firstOwner(organizationId: string): Promise<string | null>;
}

interface HandOver {
  fromUserId: string;
  toUserId: string;
}

/**
 * Locks the member's live leads that match, in id order, and gives each to the Owner. FOR UPDATE makes Postgres check
 * the condition again on a row another transaction was changing: a lead a manager reassigned or closed meanwhile no
 * longer matches once that change commits, and keeps it.
 */
async function moveLockedLeads(tx: OrgTx, actor: Actor, handOver: HandOver, matching: Sql): Promise<number> {
  const leads = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM lead
    WHERE owner_user_id = ${handOver.fromUserId}::uuid AND deleted_at IS NULL AND ${matching}
    ORDER BY id
    LIMIT ${HAND_OVER_BATCH}
    FOR UPDATE`;
  // One at a time: each change moves its lead's open tasks with it (P9).
  for (const lead of leads) await changeLeadOwner(tx, actor, { leadId: lead.id, ownerUserId: handOver.toUserId });
  return leads.length;
}

async function handOverOpenLeads(context: ListenerContext, handOver: HandOver): Promise<void> {
  const open = sql`stage IN (${joinSql(
    openLeadStages.map((stage) => sql`${stage}`),
    ", ",
  )})`;
  for (;;) {
    const selected = await context.forOrg((tx) => moveLockedLeads(tx, context.actor, handOver, open));
    if (selected === 0) return;
  }
}

/** The leads still the member's that hold open tasks of theirs, a page of those tasks a transaction. */
async function handOverLeadsWithOpenTasks(context: ListenerContext, handOver: HandOver): Promise<void> {
  let after: string | undefined;
  for (;;) {
    const page = await context.forOrg(async (tx) => {
      const tasks = await listOpenRecordTasksOf(tx, {
        assigneeUserId: handOver.fromUserId,
        recordType: "lead",
        limit: HAND_OVER_BATCH,
        ...(after === undefined ? {} : { after }),
      });
      const leadIds = [...new Set(tasks.flatMap((task) => (task.record === null ? [] : [task.record.recordId])))];
      if (leadIds.length > 0) {
        await moveLockedLeads(tx, context.actor, handOver, sql`id = ANY(${leadIds}::uuid[])`);
      }
      return { last: tasks.at(-1)?.id };
    });
    if (page.last === undefined) return;
    after = page.last;
  }
}

async function handOverStandaloneTasks(context: ListenerContext, handOver: HandOver): Promise<void> {
  for (;;) {
    // The tasks it chose are locked, so every one it chose moves: none moved means none was left.
    const moved = await context.forOrg((tx) =>
      reassignOpenStandaloneTasks(tx, context.actor, { ...handOver, limit: HAND_OVER_BATCH }),
    );
    if (moved === 0) return;
  }
}

export function handOverDepartingMemberListener(dependencies: DepartingMemberDependencies): EventListener {
  return defineListener({
    name: "crm.hand-over-departing-member",
    eventType: "staff.removed",
    payload: staffRemovedEvent,
    handle: async (event, context) => {
      const toUserId = await dependencies.firstOwner(event.organizationId);
      // ADR 0005 keeps an Owner in every organization, so none means something is wrong: fail, and the worker retries
      // and then shows the failed job to platform staff, rather than leave the work with nobody.
      if (toUserId === null) {
        throw ownMessage(
          new Error(`Organization ${event.organizationId} has no Owner to take a departing member's work`),
        );
      }
      const handOver = { fromUserId: event.payload.userId, toUserId };
      if (handOver.fromUserId === toUserId) return;
      await handOverOpenLeads(context, handOver);
      await handOverLeadsWithOpenTasks(context, handOver);
      await handOverStandaloneTasks(context, handOver);
    },
  });
}
