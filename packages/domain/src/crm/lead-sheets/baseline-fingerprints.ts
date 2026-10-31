// What a sheet's rows already there hold, as the lead import's fingerprints (S23, spec 6.5): the baseline stores them keyed,
// so a column inserted, deleted or moved, which changes every row's hash, finds each old row known by its content and adds
// none. The reading is the check's own: the stored columns matched to the header, the agency's zone, no owner targets (the
// Owner cell's text is what the fingerprint holds).
import type { Database } from "@travel-crm/db";
import { organizationTimeZone } from "../../identity/index.js";
import { rowFingerprint } from "../../imports/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import {
  findTombstones,
  matchHeader,
  sheetOrigin,
  storedColumns,
  type SheetsHashes,
  type SheetsJobDependencies,
} from "../../sheets/index.js";
import { readSheetRow, sheetLeadContext } from "./sheet-rows.js";

type BaselineFingerprints = NonNullable<SheetsJobDependencies["baselineFingerprints"]>;

export function leadSheetBaselineFingerprints(db: Database, hashes: SheetsHashes | null): BaselineFingerprints {
  return async (sheet, read) => {
    const { columns, timeZone } = await db.forOrg(sheet.organizationId, async (tx) => ({
      columns: await storedColumns(tx, sheet.id),
      timeZone: await organizationTimeZone(tx, sheet.organizationId),
    }));
    const context = sheetLeadContext({
      header: read.header,
      match: matchHeader(read.header, columns),
      ownerTargets: new Map(),
      defaultOwnerUserId: sheet.connectedBy,
      origin: sheetOrigin(sheet),
      today: calendarDateIn(new Date(), timeZone),
      agencyTimeZone: timeZone,
    });
    const readings = read.rows.map((row) => readSheetRow(row, context));
    // An erased customer's contact comes back as nothing: the row is known as erased, and no lead is ever made of it (S43).
    const erasedKeys = await db.forOrg(sheet.organizationId, (tx) =>
      findTombstones(
        tx,
        hashes,
        readings.flatMap(({ contacts }) => [
          ...(contacts.phone === null ? [] : [{ kind: "phone" as const, value: contacts.phone }]),
          ...(contacts.email === null ? [] : [{ kind: "email" as const, value: contacts.email }]),
          ...(contacts.instagramHandle === null
            ? []
            : [{ kind: "instagram" as const, value: contacts.instagramHandle }]),
        ]),
      ),
    );
    return readings.map((reading) => {
      const { phone, email, instagramHandle } = reading.contacts;
      const erased =
        (phone !== null && erasedKeys.has(`phone:${phone}`)) ||
        (email !== null && erasedKeys.has(`email:${email}`)) ||
        (instagramHandle !== null && erasedKeys.has(`instagram:${instagramHandle}`));
      return {
        fingerprint: reading.kind === "enquiry" ? rowFingerprint("leads", reading.fingerprintValues) : null,
        erased,
      };
    });
  };
}
