// What Today reads from crm (spec 3.5, R35): the brief line each lead shows beside its task: the person's name and
// phone, the lead's stage, the trip in one line and the source, for the leads the member may see. Its New leads not
// contacted yet are inbox's (uncontacted-leads.ts), as a sent message is inbox's to know.
import { leadSource, leadStage } from "@travel-crm/contracts/crm";
import type { LeadBrief } from "@travel-crm/contracts/today";
import type { OrgTx } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";
import type { MemberAccess } from "../identity/index.js";
import { isLeadInScope } from "./lead-detail.js";
import { tripColumnNames, tripSummaryOf } from "./trip-columns.js";

/**
 * The live leads among the ids that the member's leads:view scope reaches, each in brief. A lead that is gone (erased)
 * is left out, and so is one the member can't see (R26): a task of theirs may sit on someone else's lead, and its
 * person's name and phone are not theirs to read.
 */
export async function leadBriefs(
  tx: OrgTx,
  access: MemberAccess,
  leadIds: readonly string[],
): Promise<Map<string, LeadBrief>> {
  if (leadIds.length === 0) return new Map();
  const found = await tx.lead.findMany({
    where: { id: { in: [...new Set(leadIds)] } },
    select: {
      id: true,
      ownerUserId: true,
      source: true,
      stage: true,
      person: { select: { name: true, phoneE164: true } },
      ...tripColumnNames,
    },
  });
  const leads = found.filter((lead) => isLeadInScope(access, lead.ownerUserId));
  const names = await destinationNames(
    tx,
    leads.flatMap((lead) => lead.destinationId ?? []),
  );
  return new Map(
    leads.map((lead) => [
      lead.id,
      {
        id: lead.id,
        personName: lead.person.name,
        phone: lead.person.phoneE164,
        stage: leadStage.parse(lead.stage),
        trip: tripSummaryOf({ ...lead, childrenCount: lead.childrenAges.length }, names),
        source: leadSource.parse(lead.source),
      },
    ]),
  );
}
