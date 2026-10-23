// An erased customer's leads from Meta (spec 10): the person's ledger rows keep the Meta lead id and form id (neither is
// personal data, and keeping them is what stops the same Meta lead coming back from the catch-up), lose the lead, the
// person and the example name, and become erased; every example name in the organization is emptied, since none can be
// tied to one person. There is no tombstone on the contact: a person who erases themselves and fills a new ad form later
// is a new enquiry, which is what they asked for. Runs in the erasure's platform transaction, naming the organization.
import type { OrgTx } from "@travel-crm/db";

export interface MetaWithdrawn {
  leadsWithdrawn: number;
  examplesEmptied: number;
}

export async function withdrawMetaLeads(
  tx: OrgTx,
  input: { organizationId: string; personId: string },
): Promise<MetaWithdrawn> {
  const { organizationId, personId } = input;
  const withdrawn = await tx.metaLead.updateMany({
    where: { organizationId, personId },
    data: { status: "erased", reasons: [], leadId: null, personId: null, exampleName: null },
  });
  const emptied = await tx.metaLead.updateMany({
    where: { organizationId, exampleName: { not: null } },
    data: { exampleName: null },
  });
  return { leadsWithdrawn: withdrawn.count, examplesEmptied: emptied.count };
}
