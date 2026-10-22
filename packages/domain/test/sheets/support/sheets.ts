// Builds what the sheets module's tests need: the imports tests' agencies and members, an in-memory Google with a
// service account, the hashes under a fixed key, and sheets, columns and ledger rows written straight into the tables
// with no rule, audit entry or event. A test of a rule calls the module's own function instead.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import { createMemoryGoogleSheets, type MemoryGoogleSheets } from "@travel-crm/integrations/google-sheets";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import type { MemberAccess } from "../../../src/identity/index.js";
import type { ImportIdentity } from "../../../src/imports/index.js";
import type { DomainEvent, EventListener } from "../../../src/jobs/index.js";
import type { Entitlements } from "../../../src/subscriptions/index.js";
import type { Database } from "@travel-crm/db";
import { leadSheetBaselineFingerprints } from "../../../src/crm/index.js";
import { newUuidV7 } from "../../../src/kernel/index.js";
import {
  baselineListener,
  beginSheet,
  type CheckDependencies,
  createAccountHolds,
  createSheetsHashes,
  rowHash,
  type SheetsDependencies,
  type SheetsHashes,
} from "../../../src/sheets/index.js";
import { nameColumns } from "../../../src/sheets/header-keys.js";
import type { SheetsJobDependencies } from "../../../src/sheets/job-dependencies.js";
import {
  createTestImports,
  fakeIdentity,
  listenerContext,
  type TestImports,
} from "../../imports/support/test-imports.js";

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

/** A Google Form's header: what its answers and a team's own columns look like. */
export const formHeader = ["Timestamp", "Full name", "Phone number", "Email Address", "Where do you want to go?"];

/** A sheet checked by `beginSheet`, as a person's first step leaves it: a draft at the tab step. */
export async function aDraftSheet(
  test: TestSheets,
  importer: MemberAccess,
  sheet: Partial<SharedSheet> = {},
  now = new Date("2026-10-19T10:00:00Z"),
): Promise<{ sheetId: string; spreadsheetId: string }> {
  const id = aGoogleSheet(test, { id: aSpreadsheetId(), rows: [formHeader], ...sheet });
  const { sheetId } = await beginSheet(test.db, test.dependencies, importer, { spreadsheetId: id, gid: null }, now);
  return { sheetId, spreadsheetId: id };
}

/** What an agency on a plan with the CRM is entitled to: full access, or read-only (suspended or lapsed). */
export function crmEntitlements(access: Entitlements["access"] = "full"): Entitlements {
  return {
    status: access === "full" ? "active" : "read_only",
    access,
    planName: "Growth",
    modules: new Set(["crm"]),
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1_000_000 },
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
  };
}

/** The job dependencies of the sheets module on the test's database, Google, files and spreadsheets. */
export function jobDependencies(
  test: TestSheets,
  identity: ImportIdentity | SheetsJobDependencies["identity"] = fakeIdentity(),
  access: Entitlements["access"] = "full",
): SheetsJobDependencies {
  return {
    ...test.dependencies,
    db: test.db,
    files: test.files,
    spreadsheets: test.spreadsheets,
    // Nobody has a name unless the identity says so.
    identity: { memberContacts: () => Promise.resolve([]), ...identity },
    subscriptions: { entitlementsOf: () => Promise.resolve(crmEntitlements(access)) },
    logger: createMemoryLogger(),
    // As the worker builds it: the baseline keeps what each old row holds.
    baselineFingerprints: leadSheetBaselineFingerprints(test.db, test.hashes),
  };
}

/** Runs a listener on an event as the worker would, in the organization. */
export function runListener(
  test: TestSheets,
  listener: EventListener,
  organizationId: string,
  event: { type: string; payload: Record<string, string> },
): Promise<void> {
  const domainEvent: DomainEvent = {
    id: newUuidV7(),
    organizationId,
    type: event.type,
    payload: event.payload,
    occurredAt: new Date(),
  };
  return listener.handle(domainEvent, listenerContext(test, organizationId));
}

/** The matched fields a Google Form's responses sheet is given when it is connected. */
export const formFields: Record<string, string> = {
  timestamp: "enquiry_date",
  fullname: "name",
  phonenumber: "phone",
  emailaddress: "email",
};

/**
 * A sheet whose person pressed Connect: in the memory Google, shared, with its tab's columns matched, waiting for the
 * baseline (status connecting, step done).
 */
export async function aConfirmedSheet(
  test: TestSheets,
  importer: MemberAccess,
  options: {
    rows?: string[][];
    existingRows?: "only_new" | "check";
    fields?: Record<string, string>;
    more?: SharedSheet["more"];
  } = {},
): Promise<{ sheetId: string; spreadsheetId: string; organizationId: string }> {
  const rows = options.rows ?? [formHeader];
  const spreadsheetId = aGoogleSheet(test, {
    id: aSpreadsheetId(),
    rows,
    ...(options.more === undefined ? {} : { more: options.more }),
  });
  const fields = options.fields ?? formFields;
  const id = newUuidV7();
  await test.db.forOrg(importer.organizationId, async (tx) => {
    await tx.sheetConnection.create({
      data: {
        id,
        status: "connecting",
        step: "done",
        existingRows: options.existingRows ?? "only_new",
        spreadsheetId,
        tabGid: "0",
        tabTitle: "Form responses 1",
        sheetTitle: "Goa Diwali campaign (Responses)",
        sheetLocale: "en_IN",
        sheetTimeZone: "Asia/Kolkata",
        serviceAccountIndex: 0,
        connectedBy: importer.userId,
        impersonatedBy: importer.impersonatedBy,
      },
    });
    await tx.sheetColumn.createMany({
      data: nameColumns(rows[0] ?? []).map(({ header, key }) => ({
        connectionId: id,
        headerKey: key,
        header,
        field: fields[key] ?? null,
      })),
    });
  });
  return { sheetId: id, spreadsheetId, organizationId: importer.organizationId };
}

/** The dependencies of a check: the job dependencies with the worker's holds and the usual two-minute interval. */
export function checkDependencies(
  test: TestSheets,
  options: {
    identity?: ImportIdentity | SheetsJobDependencies["identity"];
    access?: Entitlements["access"];
    holds?: CheckDependencies["holds"];
    db?: Database;
  } = {},
): CheckDependencies {
  return {
    ...jobDependencies(test, options.identity ?? fakeIdentity(), options.access ?? "full"),
    ...(options.db === undefined ? {} : { db: options.db }),
    holds: options.holds ?? createAccountHolds(),
    checkIntervalSeconds: 120,
  };
}

/**
 * A sheet that is running: connected, its baseline read (every row of `rows` after the header is before_connect), shared
 * with the test's service account. `fields` say what each header holds, by header key.
 */
export async function aRunningSheet(
  test: TestSheets,
  importer: MemberAccess,
  options: {
    rows?: string[][];
    fields?: Record<string, string>;
    identity?: ImportIdentity | SheetsJobDependencies["identity"];
  } = {},
) {
  const confirmed = await aConfirmedSheet(test, importer, {
    ...(options.rows === undefined ? {} : { rows: options.rows }),
    ...(options.fields === undefined ? {} : { fields: options.fields }),
  });
  await runListener(test, baselineListener(jobDependencies(test, options.identity)), importer.organizationId, {
    type: "sheet.baseline-requested",
    payload: { sheetId: confirmed.sheetId },
  });
  return confirmed;
}
