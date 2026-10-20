// Planning a sheet's rows (S23, S24, S29): erased, blocked, the same as a row added anywhere, then saved, whose save path
// makes it a repeat enquiry on the person's open lead, a lead marked Returning, or a new lead. A row that is not finished
// waits one check. Rows in one call meet each other: the later row of a person is saved after the earlier, and a row equal
// to an earlier one of the call is a duplicate. A forecast: the save applies the rules again to the database as it is then.
import { sheetProblemReasons, type SheetProblemReason } from "@travel-crm/contracts/sheets";
import { fingerprintHex, rowFingerprint } from "../../imports/index.js";
import type { CheckMode, LedgerEntry, ReadRow } from "../../sheets/index.js";
import type { LeadRowContacts, LeadRowReading } from "../lead-import/lead-row.js";

export type SavableReading = Extract<LeadRowReading, { kind: "enquiry" }>;

export type SheetRowDecision =
  | { kind: "pending" }
  | { kind: "not_added"; reasons: SheetProblemReason[]; exampleName: string | null; exampleValue: string | null }
  | { kind: "duplicate"; fingerprint: Uint8Array }
  /** The same row as one that was there at connect, moved by a column or a sort: known, never added, never counted. */
  | { kind: "known"; fingerprint: Uint8Array }
  | { kind: "save"; reading: SavableReading; fingerprint: Uint8Array };

export interface SheetPlanInput {
  row: ReadRow;
  reading: LeadRowReading;
  ledger: LedgerEntry | undefined;
  /** Sync now and Check again end the wait of S29. */
  mode: CheckMode;
  isErased(contacts: LeadRowContacts): boolean;
  isBlocked(contacts: LeadRowContacts): boolean;
  /** Fingerprints already added anywhere, by hex (S23.4). */
  earlier: ReadonlyMap<string, Date>;
  /** Fingerprints of this sheet's rows that were there at connect, by hex. */
  baseline: ReadonlySet<string>;
}

/** The reason codes of a single row that a sheet lists (S27); any other the lead import's reading gives is dropped. */
function problemReasonOf(code: string): SheetProblemReason | null {
  return sheetProblemReasons.find((reason) => reason === code) ?? null;
}

/** A row without a name or a usable contact is unfinished: someone may still be typing it. */
const unfinished: ReadonlySet<SheetProblemReason> = new Set(["no_name", "no_contact"]);

function decideUnreadable(
  input: SheetPlanInput,
  reading: Extract<LeadRowReading, { kind: "not_added" }>,
): SheetRowDecision {
  const reasons = reading.reasons.flatMap((reason) => problemReasonOf(reason.code) ?? []);
  const waits = reasons.length > 0 && reasons.every((reason) => unfinished.has(reason));
  // A row seen before (it waited, or was listed as a problem) does not wait again: a problem stays one, and stays hidden if hidden.
  const waited = input.ledger !== undefined || input.mode !== "scheduled";
  if (waits && !waited) return { kind: "pending" };
  return { kind: "not_added", reasons, exampleName: reading.exampleName, exampleValue: reading.exampleValue };
}

export function planSheetRows(rows: readonly SheetPlanInput[], seen = new Set<string>()): SheetRowDecision[] {
  return rows.map((input): SheetRowDecision => {
    const { reading } = input;
    // An erased customer's row is left out whatever else is wrong with it, and shows none of what it holds (S43, SD10).
    if (reading.kind === "not_added" && input.isErased(reading.contacts)) {
      return { kind: "not_added", reasons: ["erased"], exampleName: null, exampleValue: null };
    }
    if (reading.kind === "not_added") return decideUnreadable(input, reading);
    // Before the rest: an old row that was blocked or erased then is not a new problem now.
    const known = fingerprintHex(rowFingerprint("leads", reading.fingerprintValues));
    if (input.baseline.has(known))
      return { kind: "known", fingerprint: rowFingerprint("leads", reading.fingerprintValues) };
    if (input.isErased(reading.contacts)) {
      return { kind: "not_added", reasons: ["erased"], exampleName: null, exampleValue: null };
    }
    if (input.isBlocked(reading.contacts)) {
      return { kind: "not_added", reasons: ["blocked"], exampleName: reading.exampleName, exampleValue: null };
    }
    const fingerprint = rowFingerprint("leads", reading.fingerprintValues);
    const key = fingerprintHex(fingerprint);
    if (input.earlier.has(key) || seen.has(key)) return { kind: "duplicate", fingerprint };
    seen.add(key);
    return { kind: "save", reading, fingerprint };
  });
}
