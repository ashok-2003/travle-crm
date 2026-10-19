// Builds what the sheets module's tests need: the imports tests' agencies and members, an in-memory Google with a
// service account, the hashes under a fixed key, and sheets, columns and ledger rows written straight into the tables
// with no rule, audit entry or event. A test of a rule calls the module's own function instead.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import { createMemoryGoogleSheets, type MemoryGoogleSheets } from "@travel-crm/integrations/google-sheets";
import { createSheetsHashes, rowHash, type SheetsHashes } from "../../../src/sheets/index.js";
import type { SheetsDependencies } from "../../../src/sheets/index.js";
import { createTestImports, type TestImports } from "../../imports/support/test-imports.js";

export { anAgency, auditOf, eventsOf, memberOf } from "../../imports/support/test-imports.js";

export const sheetsHashKey = "test-sheets-hash-key-0123456789-abcdef";

export interface TestSheets extends TestImports {
  google: MemoryGoogleSheets;
  hashes: SheetsHashes;
  dependencies: SheetsDependencies;
  /** The address agencies share their sheets with. */
  accountEmail: string;
}

export function createTestSheets(options: { accounts?: number } = {}): TestSheets {
  const base = createTestImports();
  const count = options.accounts ?? 1;
  const emails = Array.from(
    { length: count },
    (_, index) => `sheets-${String(index + 1)}@travel-crm-test.iam.gserviceaccount.com`,
  );
  const google = createMemoryGoogleSheets({ accountEmails: emails });
  const hashes = createSheetsHashes(sheetsHashKey);
  return { ...base, google, hashes, dependencies: { google, hashes }, accountEmail: emails[0] ?? "" };
}

/** A spreadsheet id of the shape Google's are: 44 characters. */
export const aSpreadsheetId = () =>
  `${randomUUID().replaceAll("-", "")}-x_${randomUUID().replaceAll("-", "").slice(0, 10)}`;

export interface SharedSheet {
  id: string;
  title?: string;
  rows?: string[][];
  tabTitle?: string;
  gid?: string;
  /** Other tabs. */
  more?: { gid: string; title: string; rows: string[][] }[];
  locale?: string;
  timeZone?: string;
}

/** A Google Form's responses sheet in the memory Google, shared with the test's service account unless told not. */
export function aGoogleSheet(test: TestSheets, sheet: SharedSheet, shared = true): string {
  const id = sheet.id;
  test.google.addSpreadsheet({
    id,
    title: sheet.title ?? "Goa Diwali campaign (Responses)",
    ...(sheet.locale === undefined ? {} : { locale: sheet.locale }),
    ...(sheet.timeZone === undefined ? {} : { timeZone: sheet.timeZone }),
    tabs: [
      {
        gid: sheet.gid ?? "0",
        title: sheet.tabTitle ?? "Form responses 1",
        rows: sheet.rows ?? [["Timestamp", "Full name", "Phone number", "Email Address"]],
      },
      ...(sheet.more ?? []),
    ],
  });
  if (shared) test.google.share(id, test.accountEmail);
  return id;
}

export interface SheetSeed {
  connectedBy: string;
  spreadsheetId?: string;
  tabGid?: string;
  tabTitle?: string;
  sheetTitle?: string;
  status?: string;
  step?: string;
  existingRows?: string | null;
  sheetLocale?: string;
  sheetTimeZone?: string;
  serviceAccountIndex?: number;
  cursorRow?: number;
  rowsSeen?: number;
  claimId?: string | null;
  impersonatedBy?: string | null;
  consecutiveFailures?: number;
  attentionSince?: Date | null;
  lastCheckedAt?: Date | null;
  lastOkAt?: Date | null;
  lastFullReadAt?: Date | null;
  checkStartedAt?: Date | null;
  holdUntil?: Date | null;
  createdAt?: Date;
  touchedAt?: Date;
  connectedAt?: Date | null;
  rowsAdded?: number;
  rowsMerged?: number;
  rowsDuplicate?: number;
  headerHash?: Uint8Array<ArrayBuffer> | null;
}

/** A running sheet connected by `connectedBy`, unless told otherwise. */
export async function aSheet(tx: OrgTx, seed: SheetSeed): Promise<{ id: string; spreadsheetId: string }> {
  const spreadsheetId = seed.spreadsheetId ?? aSpreadsheetId();
  const sheet = await tx.sheetConnection.create({
    data: {
      status: "running",
      step: "done",
      tabGid: "0",
      tabTitle: "Form responses 1",
      sheetTitle: "Goa Diwali campaign (Responses)",
      sheetLocale: "en_IN",
      sheetTimeZone: "Asia/Kolkata",
      serviceAccountIndex: 0,
      connectedAt: new Date(),
      ...seed,
      spreadsheetId,
    },
    select: { id: true },
  });
  return { id: sheet.id, spreadsheetId };
}

/** A column of the sheet, held by its header's key. */
export async function aSheetColumn(
  tx: OrgTx,
  seed: { connectionId: string; header: string; headerKey?: string; field?: string | null; isNew?: boolean },
): Promise<{ id: string }> {
  return tx.sheetColumn.create({
    data: {
      headerKey: seed.headerKey ?? seed.header.toLowerCase().replaceAll(/[^a-z0-9]/g, ""),
      ...seed,
    },
    select: { id: true },
  });
}

/** A row of the sheet's ledger; its hash is the hash of these cells unless one is given. */
export async function aSheetRow(
  tx: OrgTx,
  seed: {
    connectionId: string;
    status?: string;
    cells?: string[];
    rawHash?: Uint8Array<ArrayBuffer>;
    occurrence?: number;
    rowNumber?: number;
    reasons?: string[];
    fingerprint?: Uint8Array<ArrayBuffer> | null;
    leadId?: string | null;
    personId?: string | null;
    exampleName?: string | null;
    exampleValue?: string | null;
    resolvedAt?: Date | null;
    firstSeenAt?: Date;
  },
): Promise<{ id: string }> {
  const { cells, ...rest } = seed;
  return tx.sheetRow.create({
    data: {
      status: "before_connect",
      rowNumber: 2,
      rawHash: rowHash(cells ?? [randomUUID()]),
      ...rest,
    },
    select: { id: true },
  });
}
