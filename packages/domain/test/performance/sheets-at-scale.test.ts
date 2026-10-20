// Google Sheets sync stays within its budgets (spec 11, ADR 0028): in the large agency (50,000 leads and their people, a
// neighbouring agency's beside it) a check with nothing new costs one Google read and a few short transactions, 50 new
// rows are added in two seconds, a 20,000-row sheet is read, written down and re-read within its limits, and a sheet's page
// with its problems comes from the partial index. Everything runs as app_runtime inside forOrg, so the plans are the
// runtime's under row-level security.
import { randomUUID } from "node:crypto";
import v8 from "node:v8";
import { runInNewContext } from "node:vm";
import { createDatabase, sql, type Database, type OrgTx, type Sql } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import {
  analyzeTables,
  createIsolatedDatabase,
  createTestOrganization,
  type IsolatedDatabase,
} from "@travel-crm/db/testing";
import { createMemoryGoogleSheets } from "@travel-crm/integrations/google-sheets";
import { createMemorySpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { checkLeadSheet } from "../../src/crm/index.js";
import { createFiles } from "../../src/files/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  baselineListener,
  createAccountHolds,
  createSheetsHashes,
  sheetDetailOf,
  sheetProblems,
  type CheckDependencies,
} from "../../src/sheets/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { fakeIdentity } from "../imports/support/test-imports.js";
import {
  aConfirmedSheet,
  checkDependencies,
  jobDependencies,
  runListener,
  sheetsHashKey,
  type TestSheets,
} from "../sheets/support/sheets.js";
import { seedLargeAgency } from "./large-agency.js";
import { fastestMs, planOf, type QueryPlan } from "./query-plans.js";

const SIZE = { leads: 50_000, tasks: 0, staff: 500, destinations: 300 };
const HEADER = ["Timestamp", "Full name", "Phone number", "Email Address"];
const FIELDS = { timestamp: "enquiry_date", fullname: "name", phonenumber: "phone", emailaddress: "email" };
const row = (index: number, prefix = "9196"): string[] => [
  "19/10/2026 14:00:00",
  `Sheet Customer ${String(index)}`,
  `+${prefix}${String(index).padStart(8, "0")}`,
  "",
];

describe("Google Sheets sync in a large agency", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let importer: MemberAccess;
  let test: TestSheets;
  let identity: ReturnType<typeof fakeIdentity>;
  const found = new Map<string, QueryPlan>();
  const timings = new Map<string, number>();

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const plan = async (name: string, query: Sql) => {
    const read = await inOrg((tx) => planOf(tx, query));
    found.set(name, read);
    return read;
  };
  const timed = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    const result = await run();
    timings.set(name, Math.round(performance.now() - started));
    return result;
  };

  /** A running sheet whose baseline is read, on this database. */
  async function aSheetOfRows(rows: string[][]) {
    const confirmed = await aConfirmedSheet(test, importer, { rows, fields: FIELDS });
    await runListener(test, baselineListener(jobDependencies(test, identity)), organizationId, {
      type: "sheet.baseline-requested",
      payload: { sheetId: confirmed.sheetId },
    });
    return confirmed;
  }
  const checkOf = (dependencies: CheckDependencies, sheetId: string, mode: "scheduled" | "recheck" = "scheduled") =>
    checkLeadSheet(dependencies, { organizationId, sheetId, mode });
  const counting = (): { dependencies: CheckDependencies; transactions: () => number } => {
    let count = 0;
    const counted = Object.create(db) as Database;
    counted.forOrg = ((id: string, work: Parameters<Database["forOrg"]>[1], options?: never) => {
      count += 1;
      return db.forOrg(id, work, options);
    }) as Database["forOrg"];
    return { dependencies: checkDependencies(test, { identity, db: counted }), transactions: () => count };
  };

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    // The production defaults: a transaction past five seconds is cut (DATABASE_TRANSACTION_TIMEOUT_MS).
    db = createDatabase(isolated.urls.runtime, {
      maxConnections: 5,
      transactionLimits: { timeout: 5_000, maxWait: 2_000 },
    });
    organizationId = await createTestOrganization(platform, "Sheets agency");
    const { ownerUserIds } = await seedLargeAgency(platform, isolated.urls, organizationId, SIZE);
    // Agencies share the tables: one seeded after this one.
    const neighbour = await createTestOrganization(platform, "Neighbouring agency");
    await seedLargeAgency(platform, isolated.urls, neighbour, SIZE);
    const [asha, ravi] = [ownerUserIds[0] ?? "", ownerUserIds[1] ?? ""];
    importer = memberWithStarterRole("org-admin", { organizationId, userId: asha, memberId: randomUUID() });
    identity = fakeIdentity({ access: importer, workers: { asha, ravi }, firstOwner: asha });
    const google = createMemoryGoogleSheets();
    test = {
      db,
      platform,
      storage: createMemoryStorage(),
      files: createFiles({ db, storage: createMemoryStorage() }),
      spreadsheets: createMemorySpreadsheets(),
      google,
      hashes: createSheetsHashes(sheetsHashKey),
      dependencies: { google, hashes: createSheetsHashes(sheetsHashKey) },
      accountEmail: google.accounts()[0]?.email ?? "",
      close: () => Promise.resolve(),
    };
  }, 600_000);

  afterAll(async () => {
    const indexes = Object.fromEntries([...found].map(([name, read]) => [name, read.indexes]));
    console.info("Sheets at scale:", JSON.stringify({ milliseconds: Object.fromEntries(timings), indexes }));
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  it("checks a sheet with nothing new within 150 ms of our own time: one Google read, a few short transactions, no row written", async () => {
    const rows = [HEADER, ...Array.from({ length: 300 }, (_, index) => row(index + 1, "9195"))];
    const { sheetId } = await aSheetOfRows(rows);
    const quiet = counting();
    await checkOf(quiet.dependencies, sheetId);
    const readsBefore = test.google.calls.reads;
    const transactionsBefore = quiet.transactions();
    const fastest = await fastestMs(() => checkOf(quiet.dependencies, sheetId));
    timings.set("nothing-new", Math.round(fastest));
    expect(fastest).toBeLessThan(150);
    const checks = 8;
    expect(test.google.calls.reads - readsBefore).toBe(checks);
    // A dozen short read transactions (the sheet, the claim, the ledger, the copies above the window, the close...), none
    // held across Google.
    expect((quiet.transactions() - transactionsBefore) / checks).toBeLessThanOrEqual(12);
    const written = await inOrg((tx) => tx.sheetRow.count({ where: { connectionId: sheetId } }));
    expect(written).toBe(300);
  }, 120_000);

  it("runs 100 such checks within 10 seconds at the queue's concurrency of 4", async () => {
    const sheets: string[] = [];
    for (let index = 0; index < 100; index += 1) {
      const { sheetId } = await aSheetOfRows([HEADER, ...Array.from({ length: 20 }, (_, n) => row(n + 1, "9194"))]);
      sheets.push(sheetId);
    }
    const dependencies = checkDependencies(test, { identity, holds: createAccountHolds() });
    const queue = [...sheets];
    await timed("hundred-checks", async () => {
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          for (let sheetId = queue.shift(); sheetId !== undefined; sheetId = queue.shift()) {
            await checkOf(dependencies, sheetId);
          }
        }),
      );
    });
    expect(timings.get("hundred-checks")).toBeLessThan(10_000);
  }, 300_000);

  it("checks 50 new rows within 2 seconds, each lookup a query on its index", async () => {
    const { sheetId, spreadsheetId } = await aSheetOfRows([
      HEADER,
      ...Array.from({ length: 10 }, (_, n) => row(n + 1, "9193")),
    ]);
    for (let index = 0; index < 50; index += 1)
      test.google.append(spreadsheetId, "Form responses 1", row(index + 1, "9192"));
    const dependencies = checkDependencies(test, { identity });
    await timed("fifty-new", () => checkOf(dependencies, sheetId));
    expect(timings.get("fifty-new")).toBeLessThan(2000);
    const added = await inOrg((tx) => tx.sheetRow.count({ where: { connectionId: sheetId, status: "added" } }));
    expect(added).toBe(50);
    const lookups: [string, Sql, string][] = [
      [
        "fingerprints",
        sql`SELECT id FROM sheet_row WHERE fingerprint = ANY(ARRAY['\\x01'::bytea, '\\x02'::bytea])`,
        "sheet_row_fingerprint",
      ],
      [
        "erased",
        sql`SELECT id FROM sheet_erased_contact WHERE contact_hash = ANY(ARRAY['\\x01'::bytea, '\\x02'::bytea])`,
        "sheet_erased_contact_hash",
      ],
      [
        "pending",
        sql`SELECT row_number FROM sheet_row WHERE connection_id = ${sheetId}::uuid AND status = 'pending' ORDER BY row_number LIMIT 1`,
        "sheet_row_pending",
      ],
    ];
    for (const [name, query, index] of lookups) {
      const read = await plan(name, query);
      expect(read.indexes, `${name}: ${read.text}`).toContain(index);
    }
  }, 120_000);

  it("reads a 20,000-row sheet, writes its baseline in 30 seconds and holds the worker under 150 MB, then re-reads it in a daily full read within 10 seconds", async () => {
    const rows = [HEADER, ...Array.from({ length: 20_000 }, (_, index) => row(index + 1, "9191"))];
    const confirmed = await aConfirmedSheet(test, importer, { rows, fields: FIELDS });
    // What the worker keeps alive, not what the collector has yet to free: collect before each sample.
    v8.setFlagsFromString("--expose-gc");
    const collect = runInNewContext("gc") as () => void;
    collect();
    const before = process.memoryUsage().heapUsed;
    let peak = before;
    const watching = setInterval(() => {
      collect();
      peak = Math.max(peak, process.memoryUsage().heapUsed);
    }, 100);
    try {
      await timed("baseline-20000", () =>
        runListener(test, baselineListener(jobDependencies(test, identity)), organizationId, {
          type: "sheet.baseline-requested",
          payload: { sheetId: confirmed.sheetId },
        }),
      );
    } finally {
      clearInterval(watching);
    }
    expect(timings.get("baseline-20000")).toBeLessThan(30_000);
    expect((peak - before) / 1_000_000).toBeLessThan(150);
    const known = await inOrg((tx) => tx.sheetRow.count({ where: { connectionId: confirmed.sheetId } }));
    expect(known).toBe(20_000);
    const dependencies = checkDependencies(test, { identity });
    await timed("full-read-20000", () => checkOf(dependencies, confirmed.sheetId, "recheck"));
    expect(timings.get("full-read-20000")).toBeLessThan(10_000);
    const afterRead = await inOrg((tx) => tx.sheetRow.count({ where: { connectionId: confirmed.sheetId } }));
    expect(afterRead).toBe(20_000);
    await analyzeTables(isolated.urls, ["sheet_row"]);
    // The ledger's lookup of a hundred hashes is one read on sheet_row_hash.
    const read = await plan(
      "ledger",
      sql`SELECT id FROM sheet_row WHERE connection_id = ${confirmed.sheetId}::uuid
          AND raw_hash = ANY(ARRAY(SELECT decode(lpad(to_hex(n), 64, '0'), 'hex') FROM generate_series(1, 100) AS n))`,
    );
    expect(read.indexes, read.text).toContain("sheet_row_hash");
    expect(read.seqScans, "ledger").not.toContain("sheet_row");
  }, 400_000);

  it("re-plans a 20,000-row sheet whose column was inserted within 60 seconds, a thousand rows to a transaction on the default limits, and adds none", async () => {
    const rows = [HEADER, ...Array.from({ length: 20_000 }, (_, index) => row(index + 1, "9189"))];
    const { sheetId, spreadsheetId } = await aSheetOfRows(rows);
    // The sheet gains a column in front of the answers: every row's hash is new, none of its content.
    test.google.deleteSpreadsheet(spreadsheetId);
    test.google.addSpreadsheet({
      id: spreadsheetId,
      title: "Goa Diwali campaign (Responses)",
      tabs: [
        {
          gid: "0",
          title: "Form responses 1",
          rows: rows.map((cells, index) => [cells[0] ?? "", index === 0 ? "Budget" : "50000", ...cells.slice(1)]),
        },
      ],
    });
    test.google.share(spreadsheetId, test.accountEmail);
    const leadsBefore = await inOrg((tx) => tx.lead.count());
    await timed("column-inserted-20000", () => checkOf(checkDependencies(test, { identity }), sheetId, "recheck"));
    expect(timings.get("column-inserted-20000")).toBeLessThan(60_000);
    expect(await inOrg((tx) => tx.lead.count())).toBe(leadsBefore);
    const known = await inOrg((tx) =>
      tx.sheetRow.count({ where: { connectionId: sheetId, status: "before_connect" } }),
    );
    // Each row is in the ledger once: the old row is let go when the same row is met under its new cells (M1).
    expect(known).toBe(20_000);
  }, 400_000);

  it("serves a sheet's page, its counters and 50 problems from sheet_row_problems, within 150 ms", async () => {
    const { sheetId } = await aSheetOfRows([HEADER, ...Array.from({ length: 5 }, (_, n) => row(n + 1, "9190"))]);
    await inOrg((tx) =>
      tx.sheetRow.createMany({
        data: Array.from({ length: 200 }, (_, index) => ({
          connectionId: sheetId,
          rawHash: new Uint8Array(32).fill(0).map((_value, at) => (at === 0 ? index % 256 : Math.floor(index / 256))),
          rowNumber: 1000 + index,
          status: "not_added",
          reasons: ["no_contact"],
          exampleName: `Problem ${String(index)}`,
        })),
      }),
    );
    const facts = {
      serviceAccountEmail: test.accountEmail,
      connectedByName: "Asha",
      defaultOwnerName: null,
      readOnly: false,
    };
    const page = await fastestMs(() => inOrg((tx) => sheetDetailOf(tx, sheetId, new Date(), facts)));
    const problems = await fastestMs(() => inOrg((tx) => sheetProblems(tx, { sheetId, limit: 50 })));
    timings.set("page", Math.round(page));
    timings.set("problems", Math.round(problems));
    expect(page).toBeLessThan(150);
    expect(problems).toBeLessThan(150);
    const read = await plan(
      "problems",
      sql`SELECT id FROM sheet_row WHERE connection_id = ${sheetId}::uuid AND status = 'not_added' AND resolved_at IS NULL ORDER BY row_number LIMIT 50`,
    );
    expect(read.indexes, read.text).toContain("sheet_row_problems");
  }, 120_000);
});
