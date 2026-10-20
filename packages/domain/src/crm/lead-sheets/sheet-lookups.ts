// What a check looks up for the rows it plans, each in one query per kind for all of them (S23): the people holding the
// rows' contacts, their open leads, the blocked contacts and destinations (the lead import's own lookups), the
// fingerprints already added anywhere (imports' and the sheets'), and the erased customers' contacts.
import { type OrgTx } from "@travel-crm/db";
import { earlierFingerprints, rowFingerprint } from "../../imports/index.js";
import {
  baselineSheetFingerprints,
  type ContactKind,
  earlierSheetFingerprints,
  findTombstones,
  type SheetsHashes,
} from "../../sheets/index.js";
import { lookUpLeadRows, type LeadLookups } from "../lead-import/lead-lookups.js";
import type { LeadRowContacts, LeadRowReading } from "../lead-import/lead-row.js";

/** No import is excepted: the nil UUID matches none. */
const NO_IMPORT = "00000000-0000-0000-0000-000000000000";

export interface SheetLookups {
  lookups: LeadLookups;
  isErased(contacts: LeadRowContacts): boolean;
  /** Fingerprints already added by an import or a sheet, by hex, with when. */
  earlier: Map<string, Date>;
  /** Fingerprints (hex) of rows of this sheet that were there at connect: a row read again that holds one is known. */
  baseline: Set<string>;
}

const KINDS: readonly { kind: ContactKind; key: keyof LeadRowContacts }[] = [
  { kind: "phone", key: "phone" },
  { kind: "email", key: "email" },
  { kind: "instagram", key: "instagramHandle" },
];

export async function lookUpSheetRows(
  tx: OrgTx,
  readings: readonly LeadRowReading[],
  hashes: SheetsHashes | null,
  connectionId: string,
): Promise<SheetLookups> {
  const enquiries = readings.flatMap((reading) => (reading.kind === "enquiry" ? [reading] : []));
  // Rows that are no enquiry have contacts too, and an erased customer is known by them (SD10).
  const withContacts = readings.map((reading) => reading.contacts);
  const lookups = await lookUpLeadRows(tx, readings);
  const fingerprints = enquiries.map((reading) => rowFingerprint("leads", reading.fingerprintValues));
  const earlier = await earlierFingerprints(tx, "leads", fingerprints, NO_IMPORT);
  for (const [fingerprint, addedAt] of await earlierSheetFingerprints(tx, fingerprints, hashes)) {
    const before = earlier.get(fingerprint);
    if (before === undefined || addedAt < before) earlier.set(fingerprint, addedAt);
  }
  const baseline = await baselineSheetFingerprints(tx, connectionId, fingerprints, hashes);
  const tombstones = await findTombstones(
    tx,
    hashes,
    withContacts.flatMap((contacts) =>
      KINDS.flatMap(({ kind, key }) => {
        const value = contacts[key];
        return value === null ? [] : [{ kind, value }];
      }),
    ),
  );
  return {
    lookups,
    earlier,
    baseline,
    isErased: (contacts) =>
      KINDS.some(({ kind, key }) => contacts[key] !== null && tombstones.has(`${kind}:${contacts[key]}`)),
  };
}
