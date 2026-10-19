// A lead import's file read into rows (spec B25, B26): the check and the add read a file the same way, so the preview
// and the add can't differ. The context is built from the import's matches and the agency as they are now; the rows
// are held in memory for the job (at most 10,000 of them).
import { leadStage } from "@travel-crm/contracts/crm";
import type { SheetOrigin } from "@travel-crm/contracts/imports";
import {
  columnMatchesOf,
  readImportFile,
  valueTargetsFor,
  type ImportBatchRow,
  type ImportJobDependencies,
} from "../../imports/index.js";
import { organizationTimeZone } from "../../identity/index.js";
import type { ListenerContext } from "../../jobs/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import { readLeadRow, type LeadRowContext } from "./lead-row.js";
import type { PlannableRow } from "./lead-plan.js";

export interface LeadFile {
  rows: PlannableRow[];
  /** The rows by their number in the file. */
  byRow: ReadonlyMap<number, PlannableRow>;
  timeZone: string;
  fromSheet: boolean;
}

/** The owner rows with no (or an unknown) owner go to: the importer's pick, else the agency's Owner (B12). */
export async function defaultOwnerOf(
  dependencies: Pick<ImportJobDependencies, "identity">,
  batch: Pick<ImportBatchRow, "organizationId" | "defaultOwnerUserId" | "startedBy">,
  workers: ReadonlySet<string>,
): Promise<string> {
  if (batch.defaultOwnerUserId !== null && workers.has(batch.defaultOwnerUserId)) return batch.defaultOwnerUserId;
  return (await dependencies.identity.firstOwner(batch.organizationId)) ?? batch.startedBy;
}

/** The sheet's origin for a Google Sheet import; null for a file (or when the connection is gone). */
async function originOf(
  context: Pick<ListenerContext, "forOrg">,
  dependencies: ImportJobDependencies,
  batch: ImportBatchRow,
): Promise<SheetOrigin | null> {
  const { sourceSheetId } = batch;
  if (sourceSheetId === null) return null;
  const { sheetOrigin } = dependencies;
  if (sheetOrigin === undefined) throw new Error("A Google Sheet import needs the sheet origin dependency");
  return context.forOrg((tx) => sheetOrigin(tx, sourceSheetId));
}

/** Reads the import's file with the matches it was given, every row into an enquiry or the reasons it isn't one. */
export async function readLeadFile(
  context: ListenerContext,
  dependencies: ImportJobDependencies,
  batch: ImportBatchRow,
): Promise<LeadFile> {
  const sheet = await readImportFile(dependencies, batch);
  const { columns, timeZone } = await context.forOrg(async (tx) => ({
    columns: await columnMatchesOf(tx, batch.id),
    timeZone: await organizationTimeZone(tx, batch.organizationId),
  }));
  const origin = await originOf(context, dependencies, batch);
  const workers = new Set(
    (await dependencies.identity.leadWorkers(batch.organizationId)).map((worker) => worker.userId),
  );
  const defaultOwnerUserId = await defaultOwnerOf(dependencies, batch, workers);

  const valuesAt = (field: "owner" | "stage") => [
    ...new Set(
      sheet.rows.flatMap((row) =>
        columns.positionsOf(field).flatMap((position) => {
          const text = row.cells[position]?.trim();
          return text === undefined || text === "" ? [] : [text];
        }),
      ),
    ),
  ];
  const owners = await valueTargetsFor(context, dependencies.identity, batch, "owner", valuesAt("owner"));
  const stages = await valueTargetsFor(context, dependencies.identity, batch, "stage", valuesAt("stage"));
  const rowContext: LeadRowContext = {
    columns,
    headers: sheet.header,
    ownerOf: (value) => {
      const target = owners.get(value) ?? null;
      return target !== null && workers.has(target) ? target : null;
    },
    stageOf: (value) => {
      const parsed = leadStage.safeParse(stages.get(value));
      return parsed.success ? parsed.data : null;
    },
    defaults: {
      stage: batch.defaultStage,
      ownerUserId: defaultOwnerUserId,
      // A budget column with no basis column and no answer is for everyone (D17).
      budgetBasis: batch.budgetBasis ?? "for_everyone",
    },
    fileName: batch.fileName,
    today: calendarDateIn(new Date(), timeZone),
    timeZone,
    ...(origin === null ? {} : { origin }),
  };
  const rows = sheet.rows.map((row) => ({ ...readLeadRow(row, rowContext), rowNumber: row.rowNumber }));
  return {
    rows,
    byRow: new Map(rows.map((row) => [row.rowNumber, row])),
    timeZone,
    fromSheet: batch.sourceSheetId !== null,
  };
}
