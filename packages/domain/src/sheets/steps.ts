// The connect steps a person takes after "Check the sheet" (spec 3.2): choose a tab, match the columns, choose what to do
// with the rows already there. Each happens at its own step only, else SHEET_NOT_READY.
import type {
  ChooseExistingInput,
  ChooseSheetTabInput,
  MatchSheetColumnsInput,
  SheetField,
} from "@travel-crm/contracts/sheets";
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { rememberHeaderFields } from "../imports/index.js";
import { DomainError } from "../kernel/index.js";
import { matchedFields } from "./columns.js";
import { findSheet, holdSheet, type SheetConnectionRow, sheetNotReady } from "./connection-row.js";
import type { SheetsDependencies } from "./dependencies.js";
import { notSetUp, refusalFor } from "./google-refusals.js";
import { nameColumns } from "./header-keys.js";
import { maxSheetColumns } from "./limits.js";
import { storedColumns } from "./verify.js";

const refused = (reason: string, message: string) => new DomainError("VALIDATION", reason, message);

const alreadyConnected = () =>
  new DomainError("CONFLICT", "SHEET_ALREADY_CONNECTED", "This sheet is already connected here");

/** The sheet, held, and at one of these steps of a draft; else it has moved on. */
async function draftAt(tx: OrgTx, sheetId: string, steps: readonly SheetConnectionRow["step"][]) {
  const sheet = await holdSheet(tx, sheetId);
  if (sheet === null || sheet.status === "disconnected")
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such sheet");
  if (sheet.status !== "connecting" || !steps.includes(sheet.step)) throw sheetNotReady();
  return sheet;
}

/**
 * Chooses the draft's tab (from the tab and columns steps): the tab is described again, its headers replace the
 * draft's columns, and the draft moves to matching them. A tab already connected here is refused.
 */
export async function chooseSheetTab(
  db: Database,
  dependencies: SheetsDependencies,
  access: MemberAccess,
  input: ChooseSheetTabInput,
  now: Date,
): Promise<void> {
  const draft = await db.forOrg(access.organizationId, async (tx) => {
    const sheet = await findSheet(tx, input.sheetId);
    if (sheet.status !== "connecting" || (sheet.step !== "tab" && sheet.step !== "columns")) throw sheetNotReady();
    return sheet;
  });
  const { google } = dependencies;
  if (google === null) throw notSetUp();
  const description = await google
    .describe(draft.serviceAccountIndex, draft.spreadsheetId, { tabGid: input.tabGid })
    .catch((error: unknown) => {
      throw refusalFor(error);
    });
  const tab = description.chosenTab;
  if (tab?.gid !== input.tabGid) throw sheetNotReady();
  if (description.header.every((cell) => cell.trim() === "")) {
    throw refused("SHEET_EMPTY", "The first row of this tab is empty");
  }
  await db.forOrg(access.organizationId, async (tx) => {
    const sheet = await draftAt(tx, draft.id, ["tab", "columns"]);
    const taken = await tx.sheetConnection.findFirst({
      where: {
        spreadsheetId: sheet.spreadsheetId,
        tabGid: tab.gid,
        status: { not: "disconnected" },
        id: { not: sheet.id },
      },
      select: { id: true },
    });
    if (taken !== null) throw alreadyConnected();
    await tx.sheetColumn.deleteMany({ where: { connectionId: sheet.id } });
    await tx.sheetColumn.createMany({
      data: nameColumns(description.header.slice(0, maxSheetColumns)).map(({ header, key }) => ({
        connectionId: sheet.id,
        headerKey: key,
        header,
      })),
    });
    await tx.sheetValueMatch.deleteMany({ where: { connectionId: sheet.id } });
    await tx.sheetConnection.update({
      where: { id: sheet.id },
      data: {
        tabGid: tab.gid,
        tabTitle: tab.title.slice(0, 100),
        sheetTitle: description.title.slice(0, 200),
        step: "columns",
        touchedAt: now,
      },
    });
  });
}

function assertMatchable(fields: readonly (SheetField | null)[]): void {
  const seen = new Set<SheetField>();
  for (const field of fields) {
    if (field === null) continue;
    if (field !== "note" && seen.has(field)) throw refused("FIELD_MATCHED_TWICE", "Each field takes one column");
    seen.add(field);
  }
  if (!matchedFields([...seen].map((field) => ({ field }))).complete) {
    throw refused("IMPORT_NEEDS_NAME_AND_CONTACT", "Match a column to Name, and one to a phone, email or Instagram");
  }
}

/** Whether a sheet that is not a draft may have its columns matched again. */
const matchableAgain: ReadonlySet<SheetConnectionRow["status"]> = new Set([
  "running",
  "paused",
  "lost_access",
  "tab_missing",
  "columns_missing",
  "needs_manager",
]);

/**
 * Stores the fields of the sheet's columns and the Owner values the person matched by hand (S22). A draft at the columns
 * (or existing-rows) step moves on to the existing rows; a connected sheet is matched again (Match columns again),
 * recording sheet.columns-changed. Every column present now has been seen. Refuses a field twice but Note, a sheet
 * with no Name or no contact, and an owner who can't work leads.
 */
export async function matchSheetColumns(
  tx: OrgTx,
  access: MemberAccess,
  input: MatchSheetColumnsInput,
  context: { owners: ReadonlySet<string>; now: Date },
): Promise<void> {
  const sheet = await holdSheet(tx, input.sheetId);
  if (sheet === null || sheet.status === "disconnected")
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such sheet");
  const draft = sheet.status === "connecting";
  if (draft ? sheet.step !== "columns" && sheet.step !== "existing" : !matchableAgain.has(sheet.status)) {
    throw sheetNotReady();
  }
  const columns = await storedColumns(tx, sheet.id);
  const keys = new Set(columns.map((column) => column.headerKey));
  if (input.columns.some((column) => !keys.has(column.headerKey))) throw sheetNotReady();
  const chosen = new Map(input.columns.map((column) => [column.headerKey, column.field]));
  // A stored column the sheet no longer shows is not matched again: the person matched others instead.
  const fieldOf = (key: string): SheetField | null => chosen.get(key) ?? null;
  assertMatchable(columns.map((column) => fieldOf(column.headerKey)));
  for (const value of input.values) {
    if (value.target !== null && !context.owners.has(value.target)) {
      throw refused("NOT_A_LEAD_WORKER", "That person can't work leads");
    }
  }

  for (const column of columns) {
    await tx.sheetColumn.updateMany({
      where: { connectionId: sheet.id, headerKey: column.headerKey },
      data: { field: fieldOf(column.headerKey), isNew: false },
    });
  }
  for (const value of input.values) {
    await tx.sheetValueMatch.upsert({
      where: {
        organizationId_connectionId_field_value: {
          organizationId: access.organizationId,
          connectionId: sheet.id,
          field: "owner",
          value: value.value,
        },
      },
      create: { connectionId: sheet.id, field: "owner", value: value.value, target: value.target, matchedBy: "chosen" },
      update: { target: value.target, matchedBy: "chosen" },
    });
  }
  await rememberHeaderFields(
    tx,
    "leads",
    columns.map((column) => ({ header: column.header, field: fieldOf(column.headerKey) })),
    context.now,
  );
  await tx.sheetConnection.update({
    where: { id: sheet.id },
    data: { touchedAt: context.now, ...(draft ? { step: "existing" } : {}) },
  });
  if (!draft) {
    // The number of columns matched, never a header (spec 8).
    await recordAudit(tx, access, {
      action: "sheet.columns-changed",
      entityType: "sheet_connection",
      entityId: sheet.id,
      after: { columnsMatched: columns.filter((column) => fieldOf(column.headerKey) !== null).length },
    });
  }
}

/** Chooses what to do with the rows already in the sheet (S14), at the existing-rows step. */
export async function chooseExistingRows(tx: OrgTx, input: ChooseExistingInput, now: Date): Promise<void> {
  const sheet = await draftAt(tx, input.sheetId, ["existing"]);
  await tx.sheetConnection.update({
    where: { id: sheet.id },
    data: { existingRows: input.existingRows, touchedAt: now },
  });
}
