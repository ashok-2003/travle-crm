// The lead import's check (spec B25, Task 1.3): a dry run of every row. It reads the file again with the import's
// matches, looks up every row's contacts, open leads, blocked contacts and earlier fingerprints in one query per kind
// for the whole file, plans each row and writes the plans, then moves the import to its preview. It changes no lead,
// person or destination, so a second run writes the same rows.
import {
  markImportChecked,
  replaceImportRows,
  rowFingerprint,
  type ImportBatchRow,
  type ImportJobDependencies,
} from "../../imports/index.js";
import type { ListenerContext } from "../../jobs/index.js";
import { lookUpLeadRows } from "./lead-lookups.js";
import { earlierAnywhere } from "./earlier-anywhere.js";
import { planLeadRows } from "./lead-plan.js";
import { readLeadFile } from "./lead-read.js";

export async function checkLeadImport(
  context: ListenerContext,
  dependencies: ImportJobDependencies,
  batch: ImportBatchRow,
): Promise<void> {
  const file = await readLeadFile(context, dependencies, batch);
  const fingerprints = file.rows.flatMap((row) =>
    row.kind === "enquiry" ? [rowFingerprint("leads", row.fingerprintValues)] : [],
  );
  const { lookups, earlier } = await context.forOrg(async (tx) => ({
    lookups: await lookUpLeadRows(tx, file.rows),
    earlier: await earlierAnywhere(tx, dependencies.sheetFingerprints, fingerprints, batch.id),
  }));
  const { plans, rowsToAdd, rowsNewStage } = planLeadRows(file.rows, lookups, earlier, {
    timeZone: file.timeZone,
    fromSheet: file.fromSheet,
  });
  await replaceImportRows(context, batch.id, plans);
  await context.forOrg((tx) =>
    markImportChecked(tx, batch.id, { rowsTotal: file.rows.length, rowsToAdd, rowsNewStage }, new Date()),
  );
}
