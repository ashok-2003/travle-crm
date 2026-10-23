// One row of the lead import's add (spec B26, B31, D19): decided again against the database as it is now (a contact
// blocked since the check, a lead added by hand meanwhile, an owner who left), then saved through the one save path.
import type { RowReason } from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";
import { fingerprintHex, rowFingerprint, type ImportBatchRow, type RowOutcomeRecord } from "../../imports/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import { saveEnquiry } from "../save-enquiry.js";
import type { LeadLookups } from "./lead-lookups.js";
import type { PlannableRow } from "./lead-plan.js";

/** What every row of a batch is decided with. */
export interface RowDecision {
  batch: ImportBatchRow;
  lookups: LeadLookups;
  /** When another import added each fingerprint. */
  earlier: ReadonlyMap<string, Date>;
  workers: ReadonlySet<string>;
  defaultOwner: string;
  access: MemberAccess;
  timeZone: string;
  now: Date;
}

/** Why the importer's choices leave the row out now, "plan" for the check's own reason, or null to add it. */
function leftOutReason(
  decision: RowDecision,
  plan: string,
  reading: Extract<PlannableRow, { kind: "enquiry" }>,
): RowReason | "plan" | null {
  const { batch, lookups, earlier, timeZone } = decision;
  // Erased since the check: the row is left out whatever the importer ticked (M6).
  if (lookups.isErased(reading.contacts)) return { code: "erased" };
  if (lookups.isBlocked(reading.contacts) && !batch.addBlocked) return { code: "blocked" };
  const addedAt = earlier.get(fingerprintHex(rowFingerprint("leads", reading.fingerprintValues)));
  if (addedAt !== undefined && !batch.addAlreadyImported) {
    return { code: "already_imported", on: calendarDateIn(addedAt, timeZone) };
  }
  return plan === "in_crm" && !batch.addInCrm ? "plan" : null;
}

export async function addRow(
  tx: OrgTx,
  decision: RowDecision,
  row: { rowNumber: number; plan: string },
  reading: PlannableRow | undefined,
): Promise<RowOutcomeRecord> {
  const { rowNumber, plan } = row;
  if (reading?.kind !== "enquiry") {
    // The file reads differently than at the check: the row is not added for the reasons it has now.
    return { rowNumber, outcome: "not_added", reasons: reading?.kind === "not_added" ? reading.reasons : [] };
  }
  const leftOut = leftOutReason(decision, plan, reading);
  if (leftOut !== null) {
    return { rowNumber, outcome: "left_out", ...(leftOut === "plan" ? {} : { reasons: [leftOut] }) };
  }
  // An owner who can no longer work leads gives the row to the default owner (D19).
  const ownerUserId = decision.workers.has(reading.ownerUserId) ? reading.ownerUserId : decision.defaultOwner;
  const saved = await saveEnquiry(tx, decision.access, reading.enquiry, decision.now, {
    from: "import",
    ownerUserId,
    stage: reading.stage,
    createdAt: reading.createdAt,
    // A row naming no owner, in an import that chose none, goes by the agency's assignment (release 4).
    ...(ownerUserId === decision.defaultOwner &&
      decision.batch.defaultOwnerUserId === null && { assign: { workers: decision.workers } }),
  });
  return {
    rowNumber,
    outcome: saved.outcome === "created" ? "added" : "merged",
    leadId: saved.leadId,
    personId: saved.personId,
    fingerprint: rowFingerprint("leads", reading.fingerprintValues),
  };
}
