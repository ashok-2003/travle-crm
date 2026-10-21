// A staff file read and planned against the agency as it is now (B25, B47): the check's dry run and the add's second
// look are this one function, so the preview and the add can't judge a row differently.
import type { ReadSheet } from "@travel-crm/integrations/spreadsheets";
import type { MemberAccess } from "../../identity/index.js";
import type { ListenerContext } from "../../jobs/index.js";
import type { ImportBatchRow } from "../batch-row.js";
import { columnMatchesOf } from "../column-matches.js";
import type { ImportJobDependencies } from "../dependencies.js";
import type { ImportRowPlan } from "../import-rows.js";
import { valueTargetsFor } from "../value-matches.js";
import { namesOfReadyRows, planStaffRows } from "./staff-plan.js";
import { readStaffRow, type StaffRowReading } from "./staff-row.js";

export interface PlannedStaffFile {
  readings: StaffRowReading[];
  plans: ImportRowPlan[];
}

export async function planStaffFile(
  context: ListenerContext,
  dependencies: Pick<ImportJobDependencies, "identity">,
  batch: ImportBatchRow,
  importer: MemberAccess,
  sheet: ReadSheet,
): Promise<PlannedStaffFile> {
  const columns = await context.forOrg((tx) => columnMatchesOf(tx, batch.id));
  const rolePosition = columns.positionsOf("role")[0];
  const roleCells = rolePosition === undefined ? [] : sheet.rows.map((row) => row.cells[rolePosition] ?? null);
  const roleTargets = await valueTargetsFor(
    context,
    dependencies.identity,
    batch,
    "role",
    roleCells.filter((cell): cell is string => cell !== null && cell.trim() !== ""),
  );
  const readings = sheet.rows.map((row) =>
    readStaffRow(row, {
      columns,
      roleOf: (value) => roleTargets.get(value) ?? null,
      defaultRoleKey: batch.defaultRoleKey,
    }),
  );
  const facts = await dependencies.identity.staff.rowFacts(importer, namesOfReadyRows(readings));
  return { readings, plans: planStaffRows(readings, facts) };
}
