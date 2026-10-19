// What a check looks up for the rows it plans, each in one query per kind for all of them (S23): the people holding the
// rows' contacts, their open leads, the blocked contacts and destinations (the lead import's own lookups), the
// fingerprints already added anywhere (imports' and the sheets'), and the erased customers' contacts.
import { type OrgTx } from "@travel-crm/db";
import { earlierFingerprints, fingerprintHex, rowFingerprint } from "../../imports/index.js";
import { type ContactKind, earlierSheetFingerprints, type SheetsHashes } from "../../sheets/index.js";
import { lookUpLeadRows, type LeadLookups } from "../lead-import/lead-lookups.js";
import type { LeadRowContacts, LeadRowReading } from "../lead-import/lead-row.js";

/** No import is excepted: the nil UUID matches none. */
const NO_IMPORT = "00000000-0000-0000-0000-000000000000";

export interface SheetLookups {
  lookups: LeadLookups;
  isErased(contacts: LeadRowContacts): boolean;
  /** Fingerprints already added by an import or a sheet, by hex, with when. */
  earlier: Map<string, Date>;
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
): Promise<SheetLookups> {
  const enquiries = readings.flatMap((reading) => (reading.kind === "enquiry" ? [reading] : []));
  const lookups = await lookUpLeadRows(tx, readings);
  const fingerprints = enquiries.map((reading) => rowFingerprint("leads", reading.fingerprintValues));
  const earlier = await earlierFingerprints(tx, "leads", fingerprints, NO_IMPORT);
  for (const [fingerprint, addedAt] of await earlierSheetFingerprints(tx, fingerprints, hashes)) {
    const before = earlier.get(fingerprint);
    if (before === undefined || addedAt < before) earlier.set(fingerprint, addedAt);
  }
  const tombstones = new Set<string>();
  if (hashes !== null) {
    const asked = new Map<string, Uint8Array<ArrayBuffer>>();
    for (const reading of enquiries) {
      for (const { kind, key } of KINDS) {
        const value = reading.contacts[key];
        if (value !== null) asked.set(`${kind}:${value}`, hashes.contactHash(kind, value));
      }
    }
    if (asked.size > 0) {
      const found = await tx.sheetErasedContact.findMany({
        where: { contactHash: { in: [...asked.values()] } },
        select: { contactHash: true },
      });
      const foundHex = new Set(found.map((row) => fingerprintHex(row.contactHash)));
      for (const [contact, hash] of asked) if (foundHex.has(fingerprintHex(hash))) tombstones.add(contact);
    }
  }
  return {
    lookups,
    earlier,
    isErased: (contacts) =>
      KINDS.some(({ kind, key }) => contacts[key] !== null && tombstones.has(`${kind}:${contacts[key]}`)),
  };
}
