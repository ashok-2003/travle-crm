// A lead's page (spec 3.4): its person, trip, owner, source and open work. A lead missing, deleted or out of the
// member's leads:view scope is "not found" alike (R26), so nobody learns that another's lead exists: every crm door
// into a lead goes through findLeadInScope.
import { leadSource, leadStage, lostReason, openLeadStage, type LeadDetail } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";
import { assertRecordInScope, type MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { openTasksOf } from "../tasks/index.js";
import { personColumns } from "./people.js";
import { tripColumnNames, tripDetailOf, type TripColumns } from "./trip-columns.js";

const leadColumns = {
  id: true,
  personId: true,
  stage: true,
  reopenStage: true,
  lostReason: true,
  stageChangedAt: true,
  firstReplyAt: true,
  returning: true,
  ownerUserId: true,
  source: true,
  sourceDetail: true,
  createdBy: true,
  createdAt: true,
  ...tripColumnNames,
} as const;

/** A live lead's row, as findLeadInScope reads it. */
export interface LeadRow extends TripColumns {
  id: string;
  personId: string;
  stage: string;
  reopenStage: string | null;
  lostReason: string | null;
  stageChangedAt: Date;
  firstReplyAt: Date | null;
  returning: boolean;
  ownerUserId: string | null;
  source: string;
  sourceDetail: string | null;
  createdBy: string | null;
  createdAt: Date;
}

/** Whether the member's leads:view scope reaches a lead with this owner: identity's rule, asked without throwing. */
export function isLeadInScope(access: MemberAccess, ownerUserId: string | null): boolean {
  try {
    assertRecordInScope(access, "leads:view", ownerUserId);
    return true;
  } catch (error) {
    if (error instanceof DomainError && error.reason === "NOT_FOUND") return false;
    throw error;
  }
}

/** The live lead, if the member may see it; NOT_FOUND otherwise, whatever the reason (R26). */
export async function findLeadInScope(tx: OrgTx, access: MemberAccess, leadId: string): Promise<LeadRow> {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: leadColumns });
  if (lead === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such lead");
  assertRecordInScope(access, "leads:view", lead.ownerUserId);
  return lead;
}

/** The lead; the router adds the names of the people it mentions. */
export async function getLead(tx: OrgTx, access: MemberAccess, leadId: string): Promise<Omit<LeadDetail, "people">> {
  const lead = await findLeadInScope(tx, access, leadId);
  const person = await tx.person.findUniqueOrThrow({ where: { id: lead.personId }, select: personColumns });
  const names = await destinationNames(tx, lead.destinationId === null ? [] : [lead.destinationId]);
  const work = await openTasksOf(tx, { recordType: "lead", recordId: lead.id });
  return {
    id: lead.id,
    stage: leadStage.parse(lead.stage),
    reopenStage: lead.reopenStage === null ? null : openLeadStage.parse(lead.reopenStage),
    lostReason: lead.lostReason === null ? null : lostReason.parse(lead.lostReason),
    stageChangedAt: lead.stageChangedAt.toISOString(),
    firstReplyAt: lead.firstReplyAt?.toISOString() ?? null,
    returning: lead.returning,
    person: {
      id: person.id,
      name: person.name,
      phone: person.phoneE164,
      email: person.email,
      instagramHandle: person.instagramHandle,
    },
    trip: tripDetailOf(lead, names),
    source: leadSource.parse(lead.source),
    sourceDetail: lead.sourceDetail,
    ownerUserId: lead.ownerUserId,
    createdBy: lead.createdBy,
    createdAt: lead.createdAt.toISOString(),
    work: work.map(({ id, kind, title, dueAt, assigneeUserId }) => ({ id, kind, title, dueAt, assigneeUserId })),
  };
}
