// What a sheet's rows already there hold, as the lead import's fingerprints (S23, spec 6.5): the baseline stores them keyed,
// so a column inserted, deleted or moved, which changes every row's hash, finds each old row known by its content and adds
// none. The reading is the check's own: the stored columns matched to the header, the agency's zone, no owner targets (the
// Owner cell's text is what the fingerprint holds).
import type { Database } from "@travel-crm/db";
import { organizationTimeZone } from "../../identity/index.js";
import { rowFingerprint } from "../../imports/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import { matchHeader, sheetOrigin, storedColumns, type SheetsJobDependencies } from "../../sheets/index.js";
import { readSheetRow, sheetLeadContext } from "./sheet-rows.js";

type BaselineFingerprints = NonNullable<SheetsJobDependencies["baselineFingerprints"]>;

export function leadSheetBaselineFingerprints(db: Database): BaselineFingerprints {
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
    return read.rows.map((row) => {
      const reading = readSheetRow(row, context);
      return reading.kind === "enquiry" ? rowFingerprint("leads", reading.fingerprintValues) : null;
    });
  };
}
