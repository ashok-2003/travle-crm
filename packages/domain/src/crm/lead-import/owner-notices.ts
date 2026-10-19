// What each owner is told when an import ends (spec 8, B18, D20, D21): the importer is told by the import's own notice,
// and an owner other than the importer once, however many batches added their leads, with the count of leads that
// came to them and of repeat enquiries on theirs.
import type { OrgTx } from "@travel-crm/db";
import { formatIndianNumber, type Actor } from "../../kernel/index.js";
import { notify } from "../../notifications/index.js";
import type { ImportBatchRow } from "../../imports/index.js";

const counted = (count: number, one: string, many: string) =>
  `${formatIndianNumber(count)} ${count === 1 ? one : many}`;

/** The owners of the import's added and merged leads, with how many of each, from the leads as they are now. */
async function leadsByOwner(tx: OrgTx, importId: string) {
  return tx.$queryRaw<{ ownerUserId: string; added: number; merged: number }[]>`
    SELECT lead.owner_user_id AS "ownerUserId",
      count(*) FILTER (WHERE import_row.outcome = 'added')::int AS added,
      count(*) FILTER (WHERE import_row.outcome = 'merged')::int AS merged
    FROM import_row
    JOIN lead ON lead.organization_id = import_row.organization_id AND lead.id = import_row.lead_id
    WHERE import_row.batch_id = ${importId}::uuid AND import_row.outcome IN ('added', 'merged')
      AND lead.owner_user_id IS NOT NULL
    GROUP BY lead.owner_user_id`;
}

/**
 * One `lead.imported` notice to each owner but the importer, in the import's end transaction. The import's event is
 * the source, so a repeat of the end tells nobody twice.
 */
export async function noticeImportedOwners(
  tx: OrgTx,
  actor: Actor,
  batch: Pick<ImportBatchRow, "id" | "startedBy">,
  sourceEventId: string,
): Promise<void> {
  for (const owner of await leadsByOwner(tx, batch.id)) {
    if (owner.ownerUserId === batch.startedBy) continue;
    const added = owner.added;
    const repeats = counted(owner.merged, "repeat enquiry", "repeat enquiries");
    await notify(tx, actor, {
      recipientUserIds: [owner.ownerUserId],
      sourceEventId,
      kind: "lead.imported",
      title:
        added > 0
          ? `${counted(added, "lead from an import is", "leads from an import are")} now yours`
          : `${counted(owner.merged, "repeat enquiry from an import is", "repeat enquiries from an import are")} on your leads`,
      body: added > 0 && owner.merged > 0 ? `And ${repeats} on your leads.` : "They're on your Leads list now.",
      link: "/leads?source=bulk_upload",
      channels: ["push"],
    });
  }
}
