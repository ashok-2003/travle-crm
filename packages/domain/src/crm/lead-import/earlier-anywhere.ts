// The fingerprints already added anywhere for a lead import's rows (B33, SD15): by earlier imports, and by the Google
// Sheets' ledgers, so the same row in a file after a sheet, or in a sheet after a file, is added once.
import type { OrgTx } from "@travel-crm/db";
import { earlierFingerprints, type ImportJobDependencies } from "../../imports/index.js";

export async function earlierAnywhere(
  tx: OrgTx,
  sheetFingerprints: ImportJobDependencies["sheetFingerprints"],
  fingerprints: readonly Uint8Array[],
  exceptImportId: string,
): Promise<Map<string, Date>> {
  const earlier = await earlierFingerprints(tx, "leads", fingerprints, exceptImportId);
  if (sheetFingerprints === undefined) return earlier;
  for (const [fingerprint, addedAt] of await sheetFingerprints(tx, fingerprints)) {
    const before = earlier.get(fingerprint);
    if (before === undefined || addedAt < before) earlier.set(fingerprint, addedAt);
  }
  return earlier;
}
