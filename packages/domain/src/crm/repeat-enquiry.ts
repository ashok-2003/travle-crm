// A repeat enquiry (spec 3.2, R8): what a known customer asked this time, kept as asked on their open lead and its
// timeline, with "Repeat enquiry on your lead" for the lead's owner (R27). Someone who can't see that lead is told it
// went there, never its id (R24).
import type { CreatedLead, LeadSource, TripInput } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import type { Actor } from "../kernel/index.js";
import { publishEvent } from "../jobs/index.js";
import { notify } from "../notifications/index.js";
import { recordCrmAudit } from "./crm-audit.js";
import { isLeadInScope } from "./lead-detail.js";
import { recordLeadEvent } from "./lead-events.js";
import { resolveTrip, tripColumns } from "./trip-columns.js";

/** A member, rather than the system (a form, a webhook) acting alone. */
const isMember = (actor: Actor): actor is MemberAccess => "permissions" in actor;

/**
 * Adds the trip, source and note to the open lead as a repeat enquiry, and tells the lead's owner unless told not to
 * (an import tells nobody, B18).
 */
export async function addRepeatEnquiry(
  tx: OrgTx,
  access: Actor,
  enquiry: {
    lead: { id: string; ownerUserId: string | null; returning: boolean };
    personName: string;
    input: { trip: TripInput; source: LeadSource; sourceDetail: string | null; note: string | null };
  },
  now: Date,
  options: { notifyOwner: boolean } = { notifyOwner: true },
): Promise<CreatedLead> {
  const { lead, personName, input } = enquiry;
  const trip = await resolveTrip(tx, access, input.trip);
  const { id: enquiryId } = await tx.leadEnquiry.create({
    data: {
      leadId: lead.id,
      ...tripColumns(trip),
      source: input.source,
      sourceDetail: input.sourceDetail,
      note: input.note,
      createdBy: access.userId,
      createdAt: now,
    },
    select: { id: true },
  });
  const record = { recordType: "lead_enquiry", recordId: enquiryId } as const;
  await recordLeadEvent(tx, access, { leadId: lead.id, kind: "repeat-enquiry", record, occurredAt: now });
  await recordCrmAudit(tx, access, {
    action: "lead.repeat-enquiry",
    entityType: "lead",
    entityId: lead.id,
    after: { recordId: enquiryId },
  });
  await publishEvent(tx, { type: "lead.repeat-enquiry", payload: { leadId: lead.id, enquiryId } });
  if (options.notifyOwner && lead.ownerUserId !== null) {
    await notify(tx, access, {
      recipientUserIds: [lead.ownerUserId],
      kind: "lead.repeat-enquiry",
      title: "Repeat enquiry on your lead",
      body: `${personName} asked again`,
      link: `/leads/${lead.id}`,
      channels: ["push"],
    });
  }
  return {
    outcome: "added-to-open-lead",
    // A member sees the lead only in their scope; the system (a form, a webhook) shows nobody anything.
    leadId: !isMember(access) || isLeadInScope(access, lead.ownerUserId) ? lead.id : null,
    returning: lead.returning,
  };
}
