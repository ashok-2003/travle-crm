// A repeat enquiry (spec 3.2, R8): what a known customer asked this time, kept as asked on their open lead and its
// timeline, with "Repeat enquiry on your lead" for the lead's owner (R27).
import type { LeadSource, TripInput } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import type { Actor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { recordCrmAudit } from "./crm-audit.js";
import { recordLeadEvent } from "./lead-events.js";
import { resolveTrip, tripColumns } from "./trip-columns.js";

/**
 * Adds the trip, source and note to the open lead as a repeat enquiry, and tells the lead's owner unless told not to
 * (an import tells nobody, B18). What the lead's id may be told to a person is the caller's to decide (R24).
 */
export async function addRepeatEnquiry(
  tx: OrgTx,
  actor: Actor,
  enquiry: {
    lead: { id: string; ownerUserId: string | null; returning: boolean };
    personName: string;
    input: { trip: TripInput; source: LeadSource; sourceDetail: string | null; note: string | null };
  },
  now: Date,
  options: { notifyOwner: boolean; auditDetail?: { formId: string } } = { notifyOwner: true },
): Promise<void> {
  const { lead, personName, input } = enquiry;
  const trip = await resolveTrip(tx, actor, input.trip);
  const { id: enquiryId } = await tx.leadEnquiry.create({
    data: {
      leadId: lead.id,
      ...tripColumns(trip),
      source: input.source,
      sourceDetail: input.sourceDetail,
      note: input.note,
      createdBy: actor.userId,
      createdAt: now,
    },
    select: { id: true },
  });
  const record = { recordType: "lead_enquiry", recordId: enquiryId } as const;
  await recordLeadEvent(tx, actor, { leadId: lead.id, kind: "repeat-enquiry", record, occurredAt: now });
  await recordCrmAudit(tx, actor, {
    action: "lead.repeat-enquiry",
    entityType: "lead",
    entityId: lead.id,
    after: { recordId: enquiryId, ...options.auditDetail },
  });
  await publishEvent(tx, { type: "lead.repeat-enquiry", payload: { leadId: lead.id, enquiryId } });
  if (options.notifyOwner && lead.ownerUserId !== null) {
    await notify(tx, actor, {
      recipientUserIds: [lead.ownerUserId],
      kind: "lead.repeat-enquiry",
      title: "Repeat enquiry on your lead",
      body: `${personName} asked again`,
      link: `/leads/${lead.id}`,
      channels: ["push"],
    });
  }
}
