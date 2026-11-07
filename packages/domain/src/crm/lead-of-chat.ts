// The lead a chat's person is being worked on under: their newest lead in an open stage. A won, lost or not-a-lead one is
// closed and takes no new booking, note or follow-up, so it is never chosen.
import { openLeadStages } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";

export async function openLeadOfChat(
  tx: OrgTx,
  personId: string | null,
): Promise<{ id: string; ownerUserId: string | null; personName: string } | null> {
  if (personId === null) return null;
  const lead = await tx.lead.findFirst({
    where: { personId, stage: { in: [...openLeadStages] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, ownerUserId: true, person: { select: { name: true } } },
  });
  return lead === null ? null : { id: lead.id, ownerUserId: lead.ownerUserId, personName: lead.person.name };
}
