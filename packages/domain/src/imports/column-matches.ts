// Matching an import's columns and values (spec 3.2 step 2, B8, B10-B13): what each kind needs, one column a field
// but Note, owners and roles the agency has, the importer's value choices and the file's defaults kept, every header
// remembered for next month's file, and the check started. Matching again from the preview empties the last check.
import type { BudgetBasis, LeadImportStage } from "@travel-crm/contracts/crm";
import type { ImportField, ImportKind, ValueField } from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError } from "../kernel/index.js";
import { findImport, moveImport, notReady } from "./batches.js";
import { rememberFields } from "./header-memory.js";

export interface ColumnMatchInput {
  importId: string;
  columns: readonly { position: number; field: ImportField | null }[];
  values: readonly { field: ValueField; value: string; target: string | null }[];
  defaults: {
    stage?: LeadImportStage;
    ownerUserId?: string | null;
    budgetBasis?: BudgetBasis | null;
    roleKey?: string | null;
  };
}

/** Who and what the importer may name: the lead workers' user ids and the agency's role keys. */
export interface MatchContext {
  owners: ReadonlySet<string>;
  roleKeys: ReadonlySet<string>;
  now: Date;
}

/** The fields an import's columns are matched to, as the check and the add read them. */
export interface ColumnMatches {
  fieldOf: ReadonlyMap<number, ImportField>;
  positionsOf(field: ImportField): readonly number[];
}

const refused = (reason: string, message: string) => new DomainError("VALIDATION", reason, message);

function assertMatchable(kind: ImportKind, fields: readonly ImportField[], defaultRoleKey: string | null): void {
  const seen = new Set<ImportField>();
  for (const field of fields) {
    if (field !== "note" && seen.has(field)) throw refused("FIELD_MATCHED_TWICE", "Each field takes one column");
    seen.add(field);
  }
  if (kind === "leads" && !(seen.has("name") && (seen.has("phone") || seen.has("email") || seen.has("instagram")))) {
    throw refused("IMPORT_NEEDS_NAME_AND_CONTACT", "Match a column to Name, and one to a phone, email or Instagram");
  }
  if (
    kind === "staff" &&
    !(seen.has("name") && (seen.has("username") || seen.has("email")) && (seen.has("role") || defaultRoleKey !== null))
  ) {
    throw refused("IMPORT_NEEDS_SIGN_IN_NAME_AND_ROLE", "Match Name, a Username or Email column, and give a role");
  }
}

function assertTargets(input: ColumnMatchInput, context: MatchContext): void {
  const notWorker = () => refused("NOT_A_LEAD_WORKER", "That person can't work leads");
  const noRole = () => refused("ROLE_NOT_FOUND", "This organization has no such role");
  const owner = input.defaults.ownerUserId ?? null;
  if (owner !== null && !context.owners.has(owner)) throw notWorker();
  const role = input.defaults.roleKey ?? null;
  if (role !== null && !context.roleKeys.has(role)) throw noRole();
  for (const value of input.values) {
    if (value.target === null) continue;
    if (value.field === "owner" && !context.owners.has(value.target)) throw notWorker();
    if (value.field === "role" && !context.roleKeys.has(value.target)) throw noRole();
  }
}

export async function matchImportColumns(
  tx: OrgTx,
  access: MemberAccess,
  kind: ImportKind,
  input: ColumnMatchInput,
  context: MatchContext,
): Promise<void> {
  const batch = await findImport(tx, access, kind, input.importId);
  if (batch.status !== "matching" && batch.status !== "checked") throw notReady();
  const columns = await tx.importColumn.findMany({ where: { batchId: batch.id }, orderBy: { position: "asc" } });
  const chosen = new Map(input.columns.map((column) => [column.position, column.field]));
  const fieldOf = (position: number) => chosen.get(position) ?? null;
  assertMatchable(
    kind,
    columns.flatMap((column) => fieldOf(column.position) ?? []),
    input.defaults.roleKey ?? null,
  );
  assertTargets(input, context);

  for (const column of columns) {
    const field = fieldOf(column.position);
    if (field === column.field) continue;
    // The importer chose otherwise than the reader guessed: the guess no longer says where the field came from.
    await tx.importColumn.update({ where: { id: column.id }, data: { field, guessedBy: null } });
  }
  // Each value the importer changed is theirs from now on; one the file doesn't list is no value of it.
  const stored = await tx.importValueMatch.findMany({
    where: { batchId: batch.id, value: { in: input.values.map((value) => value.value) } },
    select: { id: true, field: true, value: true, target: true },
  });
  for (const value of input.values) {
    const match = stored.find((row) => row.field === value.field && row.value === value.value);
    if (match === undefined || match.target === value.target) continue;
    await tx.importValueMatch.update({ where: { id: match.id }, data: { target: value.target, matchedBy: "chosen" } });
  }
  // How many rows hold each value, from the column now matched to its field (D4).
  await tx.importValueMatch.updateMany({ where: { batchId: batch.id }, data: { rows: null } });
  for (const column of columns) {
    const field = fieldOf(column.position);
    if (field !== "owner" && field !== "stage" && field !== "role") continue;
    for (const [index, value] of column.distinctValues.entries()) {
      await tx.importValueMatch.updateMany({
        where: { batchId: batch.id, field, value },
        data: { rows: column.distinctCounts[index] ?? 0 },
      });
    }
  }
  await rememberFields(
    tx,
    access.organizationId,
    kind,
    columns.map((column) => ({ header: column.header, field: fieldOf(column.position) })),
  );
  // The last check's plans no longer hold.
  await tx.importRow.deleteMany({ where: { batchId: batch.id } });
  await moveImport(tx, batch.id, ["matching", "checked"], "checking", context.now, {
    defaultStage: input.defaults.stage ?? "new",
    defaultOwnerUserId: input.defaults.ownerUserId ?? null,
    budgetBasis: input.defaults.budgetBasis ?? null,
    defaultRoleKey: input.defaults.roleKey ?? null,
    checkedAt: null,
    rowsToAdd: 0,
    rowsDone: 0,
    rowsNewStage: 0,
  });
  await publishEvent(tx, { type: "import.columns-matched", payload: { importId: batch.id, kind } });
}

/** The import's columns by the fields they are matched to. */
export async function columnMatchesOf(tx: OrgTx, importId: string): Promise<ColumnMatches> {
  const columns = await tx.importColumn.findMany({
    where: { batchId: importId, field: { not: null } },
    orderBy: { position: "asc" },
    select: { position: true, field: true },
  });
  const fieldOf = new Map(columns.map((column) => [column.position, column.field as ImportField]));
  return {
    fieldOf,
    positionsOf: (field) => [...fieldOf].filter(([, matched]) => matched === field).map(([position]) => position),
  };
}
