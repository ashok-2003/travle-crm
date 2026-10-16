// When someone leaves (spec 4, R15, R37): on staff.removed their open leads, each with its open tasks, and then their
// open standalone tasks go to the agency's Owner, as the system's change (audit log and timeline), telling nobody;
// managers reassign from there. A listener's transaction has 5 seconds, so the work goes 50 at a time, each batch in
// its own transaction; what a batch moved is no longer the member's, so a repeat or a retry after a crash moves only
// what is left. Closed leads stay with the member, as do finished tasks.
import { openLeadStages } from "@travel-crm/contracts/crm";
import { staffRemovedEvent } from "@travel-crm/contracts/identity";
import { ownMessage } from "@travel-crm/integrations/jobs";
import { defineListener, type EventListener, type ListenerContext } from "../jobs/index.js";
import { reassignOpenStandaloneTasks } from "../tasks/index.js";
import { changeLeadOwner } from "./lead-core.js";

/**
 * Leads, or standalone tasks, moved in one transaction. Not R37's 200: under a loaded database one batch of 200 ran past
 * the 5 seconds, and a batch that can't finish fails again on every retry; 50 leads take about a fifth of a second on a
 * quiet one.
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

/** Moves the member's open leads, a batch a transaction, until a batch finds fewer than a full one. */
async function handOverOpenLeads(context: ListenerContext, handOver: HandOver): Promise<void> {
  for (;;) {
    const found = await context.forOrg(async (tx) => {
      const leads = await tx.lead.findMany({
        where: { ownerUserId: handOver.fromUserId, stage: { in: [...openLeadStages] } },
        select: { id: true },
        orderBy: { id: "asc" },
        take: HAND_OVER_BATCH,
      });
      // One at a time: each change locks its lead and moves its open tasks with it (P9).
      for (const lead of leads) {
        await changeLeadOwner(tx, context.actor, { leadId: lead.id, ownerUserId: handOver.toUserId });
      }
      return leads.length;
    });
    if (found < HAND_OVER_BATCH) return;
  }
}

async function handOverStandaloneTasks(context: ListenerContext, handOver: HandOver): Promise<void> {
  for (;;) {
    const moved = await context.forOrg((tx) =>
      reassignOpenStandaloneTasks(tx, context.actor, { ...handOver, limit: HAND_OVER_BATCH }),
    );
    if (moved < HAND_OVER_BATCH) return;
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
      await handOverStandaloneTasks(context, handOver);
    },
  });
}
