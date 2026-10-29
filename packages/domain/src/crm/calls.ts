// Calls on a lead (release 5, spec 3.4): a call written up with its outcome, one line about how it went and, if
// wanted, the next follow-up, all in one transaction; "Send to my phone", which pushes the number to the person's own
// phone; and the page that push opens. A call's note is never copied into the audit log or an event (as a lead note's
// is not, R28). A call counts as contact only when the customer was spoken to.
import {
  CALL_DIAL_KIND,
  CALL_EDIT_HOURS,
  type CallTarget,
  type EditCallInput,
  type LogCallInput,
} from "@travel-crm/contracts/crm";
import { softDeleted, type OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { recordCrmAudit } from "./crm-audit.js";
import { changeLeadStage, lockLead } from "./lead-core.js";
import { findLeadInScope } from "./lead-detail.js";
import { recordLeadEvent } from "./lead-events.js";
import { addLeadWork } from "./lead-work.js";

/** The words of a follow-up asked for with a call and no title of its own. */
export const DEFAULT_FOLLOW_UP_TITLE = "Call back";
const HOUR = 3_600_000;
/** "Send to my phone" is limited to this many a minute for each person. */
export const DIALS_PER_MINUTE = 10;

/** Writes a call up on the lead; Spoke on a New lead marks it contacted, as a stage move to Contacted does. */
export async function logCall(tx: OrgTx, access: MemberAccess, input: LogCallInput, now: Date): Promise<string> {
  const locked = await lockLead(tx, input.leadId);
  // The lead as this member may see it, read under the lock.
  const lead = await findLeadInScope(tx, access, input.leadId);
  const call = await tx.leadCall.create({
    data: {
      leadId: lead.id,
      outcome: input.outcome,
      note: input.note ?? null,
      occurredAt: now,
      createdBy: access.userId,
    },
    select: { id: true },
  });
  await recordLeadEvent(tx, access, {
    leadId: lead.id,
    kind: "call",
    record: { recordType: "lead_call", recordId: call.id },
    occurredAt: now,
  });
  if (input.followUp !== undefined) {
    await addLeadWork(
      tx,
      access,
      {
        leadId: lead.id,
        kind: "follow-up",
        title: input.followUp.title ?? DEFAULT_FOLLOW_UP_TITLE,
        due: input.followUp.due,
      },
      now,
    );
  }
  if (input.outcome === "spoke" && locked.stage === "new") {
    await changeLeadStage(tx, access, { leadId: lead.id, stage: "contacted" }, now);
  }
  await recordCrmAudit(tx, access, {
    action: "lead.call-logged",
    entityType: "lead",
    entityId: lead.id,
    after: { outcome: input.outcome, recordId: call.id },
  });
  await publishEvent(tx, { type: "lead.call-logged", payload: { leadId: lead.id, callId: call.id } });
  return call.id;
}

/** The call, when its lead is one the member may see; and whether this member may change it (its writer in the first day, or a manager). */
async function changeableCall(tx: OrgTx, access: MemberAccess, callId: string, now: Date) {
  const call = await tx.leadCall.findUnique({
    where: { id: callId },
    select: { id: true, leadId: true, outcome: true, createdBy: true, occurredAt: true },
  });
  if (call === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such call");
  await findLeadInScope(tx, access, call.leadId);
  const recent = now.getTime() - call.occurredAt.getTime() < CALL_EDIT_HOURS * HOUR;
  const writer = call.createdBy !== null && call.createdBy === access.userId;
  if (!((writer && recent) || access.permissions.has("leads:assign"))) {
    throw new DomainError("FORBIDDEN", "CALL_LOCKED", "A call can only be changed in the first day, by who wrote it");
  }
  return call;
}

/** Changes a call's outcome and note. */
export async function editCall(tx: OrgTx, access: MemberAccess, input: EditCallInput, now: Date): Promise<void> {
  const call = await changeableCall(tx, access, input.callId, now);
  await tx.leadCall.update({ where: { id: call.id }, data: { outcome: input.outcome, note: input.note } });
  await recordCrmAudit(tx, access, {
    action: "lead.call-edited",
    entityType: "lead",
    entityId: call.leadId,
    before: { outcome: call.outcome },
    after: { outcome: input.outcome, recordId: call.id },
  });
}

/** Deletes a call (soft, ADR 0004): it leaves the lead's timeline and its count. */
export async function deleteCall(tx: OrgTx, access: MemberAccess, callId: string, now: Date): Promise<void> {
  const call = await changeableCall(tx, access, callId, now);
  await tx.leadCall.update({ where: { id: call.id }, data: softDeleted(access.userId) });
  await recordCrmAudit(tx, access, {
    action: "lead.call-deleted",
    entityType: "lead",
    entityId: call.leadId,
    before: { outcome: call.outcome, recordId: call.id },
  });
}

/** The name and number of a lead the member may see: what the page a "Send to my phone" push opens shows. */
export async function callTargetOf(tx: OrgTx, access: MemberAccess, leadId: string): Promise<CallTarget> {
  const lead = await findLeadInScope(tx, access, leadId);
  const person = await tx.person.findUniqueOrThrow({
    where: { id: lead.personId },
    select: { name: true, phoneE164: true },
  });
  return { leadId: lead.id, name: person.name, phone: person.phoneE164 };
}

/** What limits a person's dials: the rate limiter's hit, or nothing in tests. */
export interface DialLimiter {
  hit(key: string, rule: { limit: number; windowSeconds: number }, now?: Date): Promise<{ allowed: boolean }>;
}

/**
 * Pushes "Call {name}" to the signed-in person's own devices, linking to the page that dials. Needs a phone number on
 * the lead and a device registered for push; limited to ten a minute. The push holds the name, never the number.
 */
export async function sendCallToMyPhone(
  tx: OrgTx,
  access: MemberAccess,
  leadId: string,
  limiter: DialLimiter | undefined,
  now: Date,
): Promise<void> {
  const target = await callTargetOf(tx, access, leadId);
  if (target.phone === null) throw new DomainError("CONFLICT", "LEAD_HAS_NO_PHONE", "This lead has no phone number");
  if ((await tx.pushSubscription.count({ where: { userId: access.userId } })) === 0) {
    throw new DomainError("CONFLICT", "NO_PUSH_DEVICE", "Turn on notifications on your phone first");
  }
  const result = await limiter?.hit(`call-dial:${access.userId}`, { limit: DIALS_PER_MINUTE, windowSeconds: 60 }, now);
  if (result?.allowed === false)
    throw new DomainError("CONFLICT", "DIALING_TOO_FAST", "Too many calls sent in a minute: wait a little");
  // The system sends it, because notify() leaves the acting person out and this one is for them.
  await notify(tx, systemActor(access.organizationId), {
    recipientUserIds: [access.userId],
    kind: CALL_DIAL_KIND,
    title: `Call ${target.name.replace(/\s+/g, " ").trim().slice(0, 100)}`,
    body: "Tap to dial.",
    link: `/call/${target.leadId}`,
    channels: ["push"],
  });
}
