// Describing a sheet's tab for the connect steps (S12, S13): its tabs, its columns with up to three samples and the
// field each holds (the agency's last match first, then the common names, Google Forms' own headers and words in a
// header), and the Owner column's values with a person for each. One read of Google (S13): no sample or cell is kept
// in the database, only the headers and fields.
import type { ImportField } from "@travel-crm/contracts/imports";
import type { SheetColumnsView, SheetField, VerifySheetInput } from "@travel-crm/contracts/sheets";
import type { Database, OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import type { Identity } from "../identity/index.js";
import { guessFields, rememberedHeaderFields } from "../imports/index.js";
import { asSheetField } from "./columns.js";
import { findSheet, type SheetConnectionRow, sheetNotReady } from "./connection-row.js";
import type { SheetsDependencies } from "./dependencies.js";
import { notSetUp, refusalFor } from "./google-refusals.js";
import { nameColumns } from "./header-keys.js";
import { maxCellLength, maxSheetColumns, maxSheetRows } from "./limits.js";

type OwnerMatcher = Pick<Identity, "matchLeadWorkers">;

const maxListedValues = 50;
const maxListedValueLength = 200;

interface TabReading {
  tabs: { gid: string; title: string }[];
  tab: { gid: string; title: string };
  sheetTitle: string;
  header: readonly string[];
  rows: readonly (readonly string[])[];
}

/** The tab as Google shows it now: its tabs, its header, and its rows to the limit. The tab named must still exist. */
export async function readTab(
  dependencies: SheetsDependencies,
  sheet: Pick<SheetConnectionRow, "spreadsheetId" | "serviceAccountIndex">,
  tabGid: string,
): Promise<TabReading> {
  const { google } = dependencies;
  if (google === null) throw notSetUp();
  try {
    const description = await google.describe(sheet.serviceAccountIndex, sheet.spreadsheetId, { tabGid });
    const chosen = description.chosenTab;
    if (chosen?.gid !== tabGid) throw sheetNotReady();
    const read = await google.readRows(sheet.serviceAccountIndex, sheet.spreadsheetId, {
      tabTitle: chosen.title,
      fromRow: 2,
      maxRows: maxSheetRows,
      maxColumns: maxSheetColumns,
      maxCellLength,
    });
    return {
      tabs: description.tabs.filter((tab) => tab.isGrid).map((tab) => ({ gid: tab.gid, title: tab.title })),
      tab: { gid: chosen.gid, title: chosen.title },
      sheetTitle: description.title,
      header: read.header,
      rows: read.rows.map((row) => row.cells).filter((cells) => cells.some((cell) => cell.trim() !== "")),
    };
  } catch (error) {
    throw refusalFor(error);
  }
}

/** Up to three non-empty values of each column, in the order the sheet has them. */
function samplesOf(rows: readonly (readonly string[])[], width: number): string[][] {
  return Array.from({ length: width }, (_, index) => {
    const samples: string[] = [];
    for (const row of rows) {
      const cell = (row[index] ?? "").trim();
      if (cell !== "") samples.push(cell.slice(0, 120));
      if (samples.length === 3) break;
    }
    return samples;
  });
}

/** The distinct values of a column with their rows, most rows first, when it has at most fifty. */
function valuesOf(rows: readonly (readonly string[])[], index: number): { value: string; rows: number }[] | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const cell = (row[index] ?? "").trim();
    if (cell === "" || cell.length > maxListedValueLength) continue;
    counts.set(cell, (counts.get(cell) ?? 0) + 1);
    if (counts.size > maxListedValues) return null;
  }
  return [...counts].map(([value, count]) => ({ value, rows: count })).sort((a, b) => b.rows - a.rows);
}

export interface StoredColumn {
  headerKey: string;
  header: string;
  field: SheetField | null;
  isNew: boolean;
}

export async function storedColumns(tx: OrgTx, sheetId: string): Promise<StoredColumn[]> {
  const rows = await tx.sheetColumn.findMany({ where: { connectionId: sheetId }, orderBy: { id: "asc" } });
  return rows.map((row) => ({
    headerKey: row.headerKey,
    header: row.header,
    field: asSheetField(row.field as ImportField | null),
    isNew: row.isNew,
  }));
}

/** The sheet's tab described for the connect steps, refreshing its cached titles and headers (S13). */
export async function verifySheet(
  db: Database,
  dependencies: SheetsDependencies,
  identity: OwnerMatcher,
  access: MemberAccess,
  input: VerifySheetInput,
  now: Date,
): Promise<SheetColumnsView> {
  const sheet = await db.forOrg(access.organizationId, (tx) => findSheet(tx, input.sheetId));
  const reading = await readTab(dependencies, sheet, sheet.tabGid);
  const named = nameColumns(reading.header);
  const running = sheet.status !== "connecting";

  const view = await db.forOrg(access.organizationId, async (tx) => {
    await findSheet(tx, sheet.id);
    const stored = new Map((await storedColumns(tx, sheet.id)).map((column) => [column.headerKey, column]));
    // A header the sheet gained is a new column; on a running sheet nobody has seen it yet (S15).
    const gained = named.filter(({ key }) => !stored.has(key));
    if (gained.length > 0) {
      await tx.sheetColumn.createMany({
        data: gained.map(({ header, key }) => ({
          connectionId: sheet.id,
          headerKey: key,
          header,
          isNew: running,
        })),
        skipDuplicates: true,
      });
    }
    await tx.sheetConnection.update({
      where: { id: sheet.id },
      data: {
        sheetTitle: reading.sheetTitle.slice(0, 200),
        tabTitle: reading.tab.title.slice(0, 100),
        touchedAt: now,
      },
    });
    const columns = await storedColumns(tx, sheet.id);
    const byKey = new Map(columns.map((column) => [column.headerKey, column]));
    // Guesses fill only what nobody has matched: a sheet with no match yet, and the columns it gained.
    const nothingMatched = columns.every((column) => column.field === null);
    const toGuess = named.map(({ key }) => nothingMatched || byKey.get(key)?.isNew === true);
    const remembered = await rememberedHeaderFields(tx, "leads");
    const guesses = guessFields(
      "leads",
      named.map(({ header }) => header),
      remembered,
      { wordsInHeader: true },
    );
    const keptFields = new Set(columns.flatMap((column) => (nothingMatched ? [] : (column.field ?? []))));
    const taken = new Set<SheetField>(keptFields);
    const samples = samplesOf(reading.rows, named.length);
    const view = named.map(({ header, key }, index) => {
      const column = byKey.get(key);
      const guess = toGuess[index] === true ? guesses[index] : undefined;
      const guessed = asSheetField(guess?.field ?? null);
      const usable = guessed !== null && (guessed === "note" || !taken.has(guessed));
      if (usable && guessed !== "note") taken.add(guessed);
      const stored = nothingMatched ? null : (column?.field ?? null);
      return {
        headerKey: key,
        header,
        samples: samples[index] ?? [],
        field: stored ?? (usable ? guessed : null),
        guessedBy: stored === null && usable ? (guess?.guessedBy ?? null) : null,
        isNew: column?.isNew ?? false,
        index,
      };
    });
    return view;
  });

  const ownerKey = input.valuesOf ?? view.find((column) => column.field === "owner")?.headerKey ?? null;
  const ownerColumn = ownerKey === null ? undefined : view.find((column) => column.headerKey === ownerKey);
  const listed = ownerColumn === undefined ? null : valuesOf(reading.rows, ownerColumn.index);
  const ownerValues =
    listed === null ? null : await ownerValuesFor(db, identity, access.organizationId, sheet.id, listed);

  return {
    sheetTitle: reading.sheetTitle,
    tabs: reading.tabs,
    tabGid: reading.tab.gid,
    rowCount: reading.rows.length,
    columns: view.map(({ headerKey, header, samples, field, guessedBy, isNew }) => ({
      headerKey,
      header,
      samples,
      field,
      guessedBy,
      isNew,
    })),
    ownerValues,
  };
}

/** Each listed value's target: the agency's hand-made match, else the automatic one, else the agency Owner (null). */
async function ownerValuesFor(
  db: Database,
  identity: OwnerMatcher,
  organizationId: string,
  sheetId: string,
  listed: readonly { value: string; rows: number }[],
): Promise<NonNullable<SheetColumnsView["ownerValues"]>> {
  const chosen = new Map(
    (
      await db.forOrg(organizationId, (tx) =>
        tx.sheetValueMatch.findMany({
          where: { connectionId: sheetId, field: "owner", value: { in: listed.map((entry) => entry.value) } },
          select: { value: true, target: true },
        }),
      )
    ).map((match) => [match.value, match.target]),
  );
  const automatic = await identity.matchLeadWorkers(
    organizationId,
    listed.map((entry) => entry.value).filter((value) => !chosen.has(value)),
  );
  return listed.map(({ value, rows }) => {
    if (chosen.has(value)) return { value, rows, target: chosen.get(value) ?? null, matchedBy: "chosen" as const };
    const found = automatic.get(value);
    return found === undefined
      ? { value, rows, target: null, matchedBy: "none" as const }
      : { value, rows, target: found.userId, matchedBy: found.matchedBy };
  });
}
