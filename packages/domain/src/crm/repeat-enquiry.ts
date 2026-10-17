// A repeat enquiry (spec 3.2, R8): what a known customer asked this time, kept as asked on their open lead and its
// timeline, with "Repeat enquiry on your lead" for the lead's owner (R27). Someone who can't see that lead is told it
// went there, never its id (R24).
import type { CreatedLead, CreateLeadInput } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { notify } from "../notifications/index.js";
import { recordCrmAudit } from "./crm-audit.js";
import { isLeadInScope } from "./lead-detail.js";
import { recordLeadEvent } from "./lead-events.js";
import { resolveTrip, tripColumns } from "./trip-columns.js";

/** Adds the form's trip, source and note to the open lead as a repeat enquiry. */
export async function addRepeatEnquiry(
  tx: OrgTx,
  access: MemberAccess,
  enquiry: {
    lead: { id: string; ownerUserId: string | null; returning: boolean };
    personName: string;
    input: Pick<CreateLeadInput, "trip" | "source" | "sourceDetail" | "note">;
  },
  now: Date,
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
  if (lead.ownerUserId !== null) {
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
    leadId: isLeadInScope(access, lead.ownerUserId) ? lead.id : null,
    returning: lead.returning,
  };
}
