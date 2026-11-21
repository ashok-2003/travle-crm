// The leads the AI needs a person on (leads show spec, 2026-11-21), for the Leads list's Show: AI needs a person. They
// are "Needs you"'s own two parts, by its own rules (handedOverWhere, openSuggestionsWhere), as leads: every lead of a
// handed-over chat's person, and each lead with an open Lost / Not a lead suggestion. Newest need first.
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { handedOverWhere } from "./agent-setup.js";
import { leadsTheAiNeedsAbout, openSuggestionsWhere } from "./lite/suggestions.js";

/** The ids, newest need first (then the newest lead). Hand-overs count only for a member whose inbox shows chats. */
export async function leadsNeedingPerson(
  tx: OrgTx,
  access: MemberAccess,
  { mine }: { mine: boolean },
): Promise<string[]> {
  const needs = new Map<string, Date>();
  const note = (leadId: string, at: Date) => {
    const seen = needs.get(leadId);
    if (seen === undefined || at > seen) needs.set(leadId, at);
  };
  const suggestions = await tx.leadAiSuggestion.findMany({
    where: openSuggestionsWhere(access, mine),
    select: { leadId: true, createdAt: true },
  });
  for (const row of suggestions) note(row.leadId, row.createdAt);
  if (access.permissions.scopeOf("inbox:view") !== null) {
    const chats = await tx.aiChat.findMany({
      where: handedOverWhere(access, mine),
      select: { handedOffAt: true, conversation: { select: { personId: true } } },
    });
    const handedOver = new Map<string, Date>();
    for (const { handedOffAt, conversation } of chats) {
      const seen = conversation.personId === null ? undefined : handedOver.get(conversation.personId);
      if (handedOffAt !== null && conversation.personId !== null && (seen === undefined || handedOffAt > seen)) {
        handedOver.set(conversation.personId, handedOffAt);
      }
    }
    const leads = await tx.lead.findMany({
      where: { ...leadsTheAiNeedsAbout(access, mine), personId: { in: [...handedOver.keys()] } },
      select: { id: true, personId: true },
    });
    for (const lead of leads) {
      const at = handedOver.get(lead.personId);
      if (at !== undefined) note(lead.id, at);
    }
  }
  return [...needs]
    .sort(([aId, a], [bId, b]) => b.getTime() - a.getTime() || (aId < bId ? 1 : aId > bId ? -1 : 0))
    .map(([leadId]) => leadId);
}
