// What owners are told when a sheet adds leads (spec 8, S32): up to five leads or repeat enquiries for one owner in a
// check send the usual "New lead assigned to you" and "Repeat enquiry on your lead", each as saveEnquiry sends them; more
// than five send one summary instead, so a form's trickle notifies and an outage's pile does not.
import type { OrgTx } from "@travel-crm/db";
import { formatIndianNumber, type Actor } from "../../kernel/index.js";
import { notify } from "../../notifications/index.js";

/** An owner with more than this many in one check is sent one summary. */
export const SUMMARY_ABOVE = 5;

/** The owners whose rows in this check number more than five: they get one lead.sheet-added, not a notice a row. */
export function ownersToSummarise(candidates: ReadonlyMap<string, number>): ReadonlySet<string> {
  return new Set([...candidates].filter(([, count]) => count > SUMMARY_ABOVE).map(([owner]) => owner));
}

/** One lead.sheet-added to each owner of the summarised, in the check's end transaction. The actor is never told. */
export async function noticeSheetOwners(
  tx: OrgTx,
  actor: Actor,
  input: { sheetTitle: string; counts: ReadonlyMap<string, number>; sourceEventId: string },
): Promise<void> {
  for (const [ownerUserId, count] of input.counts) {
    if (count <= SUMMARY_ABOVE) continue;
    await notify(tx, actor, {
      recipientUserIds: [ownerUserId],
      sourceEventId: input.sourceEventId,
      kind: "lead.sheet-added",
      title: `${formatIndianNumber(count)} new leads from '${input.sheetTitle.slice(0, 80)}' are now yours`,
      body: "They're on your Leads list now.",
      link: "/leads?source=google_sheet",
      channels: ["push"],
    });
  }
}
