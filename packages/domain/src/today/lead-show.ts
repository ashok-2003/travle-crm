// Which leads a Leads list's Show holds (leads show spec, 2026-11-21): Home's and My tasks' work as a list, each by the
// rule of the module that owns it and in its own order: the hot leads (sales, hottest first), those with a follow-up
// overdue (tasks, longest overdue first), the New leads nobody has called or messaged yet (inbox, My tasks' own rule,
// longest waiting first), and those the AI needs a person on (the AI's "Needs you", newest first). Today sits above
// them all, so the api's list and the worker's export ask here; crm then applies the tab, the scope and the filters.
import type { OrgTx } from "@travel-crm/db";
import { leadsNeedingPerson } from "../ai/index.js";
import type { ChosenLeads, ShowFilter } from "../crm/index.js";
import { organizationTimeZone, scopeFilter, type MemberAccess } from "../identity/index.js";
import { uncontactedLeads, type UncontactedLeadsFilter } from "../inbox/index.js";
import { calendarDateIn } from "../kernel/index.js";
import { hotLeadIds, salesAutomationOf } from "../sales/index.js";
import { overdueRecordIds } from "../tasks/index.js";

/**
 * Whose New leads the rule reads, as crm's list will narrow them (its scope, Mine, an owner chosen, the Unassigned
 * queue), so the call and message checks run only on leads the list can show.
 */
function whoseUncontacted(access: MemberAccess, filter: ShowFilter): UncontactedLeadsFilter {
  const scoped = scopeFilter(access, "leads:view", "ownerUserId").ownerUserId;
  if (scoped !== undefined) return { ownerUserId: scoped };
  if (filter.view === "mine") return { ownerUserId: access.userId };
  if (filter.ownerUserId !== undefined) return { ownerUserId: filter.ownerUserId };
  return filter.view === "unassigned" ? { unownedOnly: true } : {};
}

export async function leadsToShow(
  tx: OrgTx,
  access: MemberAccess,
  filter: ShowFilter,
  now: Date,
): Promise<ChosenLeads> {
  switch (filter.show) {
    case "hot": {
      const today = calendarDateIn(now, await organizationTimeZone(tx, access.organizationId));
      return { ids: await hotLeadIds(tx, access, await salesAutomationOf(tx), { now, today }), mineChosen: false };
    }
    case "overdue": {
      const overdue = { recordType: "lead", kind: "follow-up" as const, dueBefore: now };
      return { ids: await overdueRecordIds(tx, overdue), mineChosen: false };
    }
    case "uncontacted": {
      const waiting = await uncontactedLeads(tx, whoseUncontacted(access, filter));
      return { ids: waiting.map((row) => row.leadId), mineChosen: false };
    }
    case "ai": {
      // The AI's own Mine: for whoever manages the AI, the unowned leads too, as Home's "AI needs you" holds them.
      const mine = filter.view === "mine";
      return { ids: await leadsNeedingPerson(tx, access, { mine }), mineChosen: mine };
    }
  }
}
