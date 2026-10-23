// The ledger of Meta leads seen (M7): one row per Meta lead id in the agency, so a delivery, a retry and the catch-up
// converge on one lead. It holds no answers and no contact; a problem row alone keeps a short example name.
import type { MetaProblemReason } from "@travel-crm/contracts/meta-leads";
import type { OrgTx } from "@travel-crm/db";
import type { MetaLeadPlatform } from "@travel-crm/integrations/meta-graph";

export type LedgerStatus = "pending" | "added" | "merged" | "duplicate" | "not_added" | "erased";

export interface LedgerRow {
  id: string;
  metaLeadId: string;
  formId: string;
  status: LedgerStatus;
  reasons: MetaProblemReason[];
  leadId: string | null;
  personId: string | null;
  createdAtMeta: Date | null;
  platform: MetaLeadPlatform | null;
  exampleName: string | null;
  resolvedAt: Date | null;
  firstSeenAt: Date;
  processedAt: Date | null;
}

type StoredLedger = NonNullable<Awaited<ReturnType<OrgTx["metaLead"]["findFirst"]>>>;

function toLedgerRow(row: StoredLedger): LedgerRow {
  return {
    id: row.id,
    metaLeadId: row.metaLeadId,
    formId: row.formId,
    status: row.status as LedgerStatus,
    reasons: row.reasons as MetaProblemReason[],
    leadId: row.leadId,
    personId: row.personId,
    createdAtMeta: row.createdAtMeta,
    platform: row.platform as MetaLeadPlatform | null,
    exampleName: row.exampleName,
    resolvedAt: row.resolvedAt,
    firstSeenAt: row.firstSeenAt,
    processedAt: row.processedAt,
  };
}

/** A lead with one of these needs nothing more, whoever delivers it again (M7 step 3). */
export const settledStatuses: readonly LedgerStatus[] = ["added", "merged", "duplicate", "erased"];
export const isSettled = (row: Pick<LedgerRow, "status">) => settledStatuses.includes(row.status);

export async function ledgerRowOf(tx: OrgTx, metaLeadId: string): Promise<LedgerRow | null> {
  // Row-level security shows the agency's rows only, so the Meta lead id finds its own.
  const row = await tx.metaLead.findFirst({ where: { metaLeadId } });
  return row === null ? null : toLedgerRow(row);
}

/**
 * The lead's row, made `pending` when the agency has none. The unique key `(organization_id, meta_lead_id)` takes turns
 * between a delivery and the catch-up that meet at once: the loser reads the winner's row.
 */
export async function claimLedger(
  tx: OrgTx,
  input: { metaLeadId: string; formId: string; now: Date },
): Promise<LedgerRow> {
  await tx.metaLead.createMany({
    data: [{ metaLeadId: input.metaLeadId, formId: input.formId, status: "pending", firstSeenAt: input.now }],
    skipDuplicates: true,
  });
  const row = await ledgerRowOf(tx, input.metaLeadId);
  if (row === null) throw new Error("The ledger row was not found after claiming it");
  return row;
}

/**
 * The lead's row, locked until the transaction ends (made pending when there is none): a delivery and the catch-up that
 * meet at once take turns here, and the second finds the first's outcome and saves nothing (M7 step 3, 8.2).
 */
export async function holdLedger(
  tx: OrgTx,
  input: { metaLeadId: string; formId: string; now: Date },
): Promise<LedgerRow> {
  const row = await claimLedger(tx, input);
  await tx.$queryRaw`SELECT id FROM meta_lead WHERE id = ${row.id}::uuid FOR UPDATE`;
  const held = await ledgerRowOf(tx, input.metaLeadId);
  if (held === null) throw new Error("The ledger row vanished while it was held");
  return held;
}

export type LedgerOutcome =
  | { status: "added" | "merged"; leadId: string; personId: string }
  | { status: "duplicate"; leadId: string | null; personId: string | null }
  | { status: "not_added"; reasons: MetaProblemReason[]; exampleName: string | null };

/** Writes what became of the lead, in the transaction that saved it, so it is saved and marked or neither. */
export async function writeOutcome(
  tx: OrgTx,
  row: Pick<LedgerRow, "id">,
  outcome: LedgerOutcome,
  facts: { createdAtMeta: Date; platform: MetaLeadPlatform; now: Date },
): Promise<void> {
  const base = { createdAtMeta: facts.createdAtMeta, platform: facts.platform, processedAt: facts.now };
  const data =
    outcome.status === "not_added"
      ? {
          ...base,
          status: "not_added",
          reasons: outcome.reasons,
          exampleName: outcome.exampleName === null ? null : outcome.exampleName.slice(0, 120),
          leadId: null,
          personId: null,
          resolvedAt: null,
        }
      : {
          ...base,
          status: outcome.status,
          reasons: [],
          exampleName: null,
          leadId: outcome.leadId,
          personId: outcome.personId,
          resolvedAt: null,
        };
  await tx.metaLead.update({ where: { id: row.id }, data });
}

/** Rows left pending for longer than `olderThan` (a crash between the Graph read and the save), oldest first. */
export async function stalePending(tx: OrgTx, olderThan: Date, limit: number): Promise<LedgerRow[]> {
  const rows = await tx.metaLead.findMany({
    where: { status: "pending", firstSeenAt: { lt: olderThan } },
    orderBy: { firstSeenAt: "asc" },
    take: limit,
  });
  return rows.map(toLedgerRow);
}
