// "Sent": a staff member opened the AI-written message in their own WhatsApp and pressed send there. The product marks the
// departure as offered to this lead (so the list leaves them alone for 14 days), writes a note on the lead's timeline, and
// audits "drafted by AI, approved by X", with whether the member changed the words first (compared by hash; the words are
// kept nowhere). One person at a time: nothing in bulk.
import type { MarkOfferSentInput } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import { addLeadNote } from "../../crm/index.js";
import { findDeparture } from "../../departures/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";
import { hashOf } from "../suggest.js";

export async function recordOfferSent(
  tx: OrgTx,
  access: MemberAccess,
  input: MarkOfferSentInput,
  now: Date,
): Promise<void> {
  const departure = await findDeparture(tx, input.departureId);
  const fill = await tx.aiFill.findFirst({
    where: {
      id: input.fillId,
      requestedBy: access.userId,
      target: "departure_offer",
      subjectId: input.leadId,
    },
    select: { id: true, appliedAt: true, fieldHashes: true },
  });
  if (fill === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  // The same message marked again (a second tap, a retry) changes nothing more.
  if (fill.appliedAt !== null) return;
  // The lead must be the member's to see: addLeadNote refuses one that is not, before anything is written.
  await addLeadNote(tx, access, {
    leadId: input.leadId,
    body: `Offered seats on ${departure.title} by WhatsApp (message written with AI).`,
  });
  const changed = hashOf(input.text) !== (fill.fieldHashes as Record<string, string>).message;
  await tx.departureOffer.upsert({
    where: {
      organizationId_departureId_leadId: {
        organizationId: access.organizationId,
        departureId: departure.id,
        leadId: input.leadId,
      },
    },
    create: { departureId: departure.id, leadId: input.leadId, draftedBy: access.userId, fillId: fill.id, sentAt: now },
    update: { draftedBy: access.userId, fillId: fill.id, sentAt: now },
  });
  await tx.aiFill.update({
    where: { id: fill.id },
    data: {
      appliedAt: now,
      appliedBy: access.userId,
      appliedFields: ["message"],
      changedFields: changed ? ["message"] : [],
    },
  });
  await recordAudit(tx, access, {
    action: "ai.offer-sent",
    entityType: "departure",
    entityId: departure.id,
    after: { changedByMember: changed },
  });
}
