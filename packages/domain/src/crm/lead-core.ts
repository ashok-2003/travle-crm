// The two changes every door into a lead shares (P9): moving its stage and changing its owner. The lead page's
// procedures, Block this number and a departing member's hand-over all call these, so the rules live once: the open
// stage a lead left (R30) and its first reply (spec 4); its open tasks cancelled on Lost and Not a lead (R29) or moved
// to the new owner (R21); the timeline entry, audit entry and event; and "New lead assigned to you" when a person, not
// the system, makes someone else the owner (R27). Whether the actor may make the change is the caller's to check.
import { isOpenStage, leadStage, type LeadStage } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { cancelOpenTasks, reassignOpenTasks } from "../tasks/index.js";
import { recordCrmAudit } from "./crm-audit.js";
import { recordLeadEvent } from "./lead-events.js";

/** The live lead, its row locked until the transaction ends, so two changes at once apply one after the other. */
async function lockLead(tx: OrgTx, leadId: string) {
  const [lead] = await tx.$queryRaw<{ stage: string; firstReplyAt: Date | null; ownerUserId: string | null }[]>`
    SELECT stage, first_reply_at AS "firstReplyAt", owner_user_id AS "ownerUserId"
    FROM lead WHERE id = ${leadId}::uuid AND deleted_at IS NULL
    FOR UPDATE`;
  if (lead === undefined) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such lead");
  return { ...lead, stage: leadStage.parse(lead.stage) };
}

/**
 * Moves the lead to a stage. Leaving an open stage keeps it for Reopen; first leaving New for anything but Not a lead
 * keeps the first reply's time; Lost and Not a lead cancel every open task on the lead, shown on its timeline. A
 * closed lead moved to an open stage is recorded as reopened. Returns false, recording nothing, when the lead is
 * already in that stage (a second tab's stale tap, R31).
 */
export async function changeLeadStage(
  tx: OrgTx,
  actor: Actor,
  change: { leadId: string; stage: LeadStage },
  now: Date,
): Promise<boolean> {
  const { leadId, stage: to } = change;
  const lead = await lockLead(tx, leadId);
  const from = lead.stage;
  if (from === to) return false;
  const firstReply = from === "new" && to !== "not_a_lead" && lead.firstReplyAt === null;
  await tx.lead.update({
    where: { id: leadId },
    data: {
      stage: to,
      stageChangedAt: now,
      ...(isOpenStage(from) ? { reopenStage: from } : {}),
      ...(firstReply ? { firstReplyAt: now } : {}),
    },
  });
  if (to === "lost" || to === "not_a_lead") {
    for (const task of await cancelOpenTasks(tx, actor, { recordType: "lead", recordId: leadId }, now)) {
      const record = { recordType: "task", recordId: task.id } as const;
      await recordLeadEvent(tx, actor, { leadId, kind: "follow-up-cancelled", record, occurredAt: now });
    }
  }
  await recordLeadEvent(tx, actor, { leadId, kind: "stage-changed", stage: to, occurredAt: now });
  const action: "lead.stage-changed" | "lead.reopened" =
    !isOpenStage(from) && isOpenStage(to) ? "lead.reopened" : "lead.stage-changed";
  await recordCrmAudit(tx, actor, {
    action,
    entityType: "lead",
    entityId: leadId,
    before: { stage: from },
    after: { stage: to },
  });
  await publishEvent(tx, { type: "lead.stage-changed", payload: { leadId, from, to } });
  return true;
}

/**
 * Makes someone the lead's owner, with every open task on it (R21). Tells them, unless the system did it (a departing
 * member's hand-over notifies nobody, R27). Returns false, recording nothing, when they already own it.
 */
export async function changeLeadOwner(
  tx: OrgTx,
  actor: Actor,
  change: { leadId: string; ownerUserId: string },
): Promise<boolean> {
  const { leadId, ownerUserId } = change;
  const lead = await lockLead(tx, leadId);
  if (lead.ownerUserId === ownerUserId) return false;
  await tx.lead.update({ where: { id: leadId }, data: { ownerUserId } });
  await reassignOpenTasks(tx, actor, { recordType: "lead", recordId: leadId }, ownerUserId);
  await recordLeadEvent(tx, actor, { leadId, kind: "reassigned", ownerUserId });
  await recordCrmAudit(tx, actor, {
    action: "lead.reassigned",
    entityType: "lead",
    entityId: leadId,
    before: { ownerUserId: lead.ownerUserId },
    after: { ownerUserId },
  });
  await publishEvent(tx, {
    type: "lead.reassigned",
    payload: { leadId, fromUserId: lead.ownerUserId, toUserId: ownerUserId },
  });
  if (actor.userId !== null) await notifyLeadAssigned(tx, actor, { leadId, ownerUserId });
  return true;
}

/**
 * "New lead assigned to you" (R27), in the bell and by push: "Rahul Sharma · Kashmir", linking to the lead. The
 * actor is never told of their own change. The lead form calls it too, for a lead added for someone else.
 */
export async function notifyLeadAssigned(
  tx: OrgTx,
  actor: Actor,
  lead: { leadId: string; ownerUserId: string },
): Promise<void> {
  const { person, destination } = await tx.lead.findUniqueOrThrow({
    where: { id: lead.leadId },
    select: { person: { select: { name: true } }, destination: { select: { name: true } } },
  });
  await notify(tx, actor, {
    recipientUserIds: [lead.ownerUserId],
    kind: "lead.assigned",
    title: "New lead assigned to you",
    body: destination === null ? person.name : `${person.name} · ${destination.name}`,
    link: `/leads/${lead.leadId}`,
    channels: ["push"],
  });
}
