// What owners are told when a catch-up adds leads (spec 11): up to five leads in a catch-up send the usual "New lead assigned
// to you" and "Repeat enquiry on your lead" (saveEnquiry sends them); more than five send each owner one summary instead,
// so a Page's trickle notifies and an outage's pile does not.
import type { Database } from "@travel-crm/db";
import { formatIndianNumber, systemActor } from "../../kernel/index.js";
import { noticeSourceOf, type MetaPageRow } from "../../meta-leads/index.js";
import { notify } from "../../notifications/index.js";

/** A catch-up that adds more than this many leads sends summaries and no notice a lead. */
export const SUMMARY_ABOVE = 5;

/** One lead.meta-added to each owner whose leads this catch-up made, when it made more than five in all. */
export async function noticeMetaOwners(
  db: Database,
  page: Pick<MetaPageRow, "id" | "organizationId" | "pageName">,
  madeFor: ReadonlyMap<string, number>,
  now: Date,
): Promise<void> {
  const total = [...madeFor.values()].reduce((sum, count) => sum + count, 0);
  if (total <= SUMMARY_ABOVE) return;
  await db.forOrg(page.organizationId, async (tx) => {
    for (const [ownerUserId, count] of madeFor) {
      await notify(tx, systemActor(page.organizationId), {
        recipientUserIds: [ownerUserId],
        sourceEventId: noticeSourceOf("lead-added", page.id, ownerUserId, now.toISOString()),
        kind: "lead.meta-added",
        title: `${formatIndianNumber(count)} new leads from '${page.pageName.slice(0, 80)}' are now yours`,
        body: "They're on your Leads list now.",
        link: "/leads?source=meta_lead_ad",
        channels: ["push"],
      });
    }
  });
}
