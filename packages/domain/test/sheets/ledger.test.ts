// The ledger: a row is known whatever row it moved to, by its hash and occurrence, plain or re-keyed; waiting rows are read
// again; problems and waiting rows that left the sheet are cleared at the read that covers their place.
import { afterAll, describe, expect, it } from "vitest";
import { clearVanishedRows, isKnown, ledgerKey, lookUpLedger, numberRows, rowHash } from "../../src/sheets/index.js";
import { aSheet, aSheetRow, anAgency, createTestSheets, memberOf } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

const now = new Date("2026-10-19T10:00:00Z");

async function sheetWithRows(
  rows: { cells: string[]; status: string; rowNumber: number; occurrence?: number; resolvedAt?: Date | null }[],
) {
  const agency = await anAgency(test);
  const importer = memberOf(agency);
  const sheet = await test.db.forOrg(agency, (tx) => aSheet(tx, { connectedBy: importer.userId }));
  await test.db.forOrg(agency, async (tx) => {
    for (const { cells, ...row } of rows) {
      await aSheetRow(tx, { connectionId: sheet.id, cells, ...row });
    }
  });
  return { agency, sheetId: sheet.id };
}
const read = (cells: string[][], firstRow = 2) =>
  numberRows(cells.map((row, index) => ({ rowNumber: firstRow + index, cells: row })));

describe("lookUpLedger", () => {
  it("finds a known row whatever row it moved to: sorted, inserted above or deleted above", async () => {
    const { agency, sheetId } = await sheetWithRows([
      { cells: ["Asha", "1"], status: "added", rowNumber: 2 },
      { cells: ["Ravi", "2"], status: "before_connect", rowNumber: 3 },
      { cells: ["Meena", "3"], status: "merged", rowNumber: 4 },
    ]);
    // The same rows sorted, one new row inserted above.
    const rows = read([
      ["Zoya", "9"],
      ["Meena", "3"],
      ["Asha", "1"],
      ["Ravi", "2"],
    ]);
    const ledger = await test.db.forOrg(agency, (tx) => lookUpLedger(tx, sheetId, rows, test.hashes));
    const known = rows.map((row) => isKnown(ledger.get(ledgerKey(row.hash, row.occurrence))));
    expect(known).toEqual([false, true, true, true]);
    expect(ledger.get(ledgerKey(rows[2]?.hash ?? new Uint8Array(), 1))).toMatchObject({
      status: "added",
      rowNumber: 2,
    });
  });

  it("treats before_connect, added, merged, duplicate and erased as known, and pending and not_added as to be read again", async () => {
    const statuses = ["before_connect", "added", "merged", "duplicate", "erased", "pending", "not_added"];
    const { agency, sheetId } = await sheetWithRows(
      statuses.map((status, index) => ({ cells: [status], status, rowNumber: index + 2 })),
    );
    const rows = read(statuses.map((status) => [status]));
    const ledger = await test.db.forOrg(agency, (tx) => lookUpLedger(tx, sheetId, rows, test.hashes));
    expect(rows.map((row) => isKnown(ledger.get(ledgerKey(row.hash, row.occurrence))))).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(isKnown(undefined)).toBe(false);
  });

  it("keeps two identical rows apart by occurrence", async () => {
    const { agency, sheetId } = await sheetWithRows([
      { cells: ["Asha", "1"], status: "added", rowNumber: 2, occurrence: 1 },
    ]);
    const rows = read([
      ["Asha", "1"],
      ["Asha", "1"],
    ]);
    const ledger = await test.db.forOrg(agency, (tx) => lookUpLedger(tx, sheetId, rows, test.hashes));
    expect(rows.map((row) => isKnown(ledger.get(ledgerKey(row.hash, row.occurrence))))).toEqual([true, false]);
  });

  it("finds an erased row by its re-keyed hash", async () => {
    const plain = rowHash(["Asha", "98765 43210"]);
    const { agency, sheetId } = await sheetWithRows([]);
    await test.db.forOrg(agency, (tx) =>
      aSheetRow(tx, { connectionId: sheetId, status: "erased", rawHash: test.hashes.rekey(plain), rowNumber: 2 }),
    );
    const rows = read([["Asha", "98765 43210"]]);
    const withKey = await test.db.forOrg(agency, (tx) => lookUpLedger(tx, sheetId, rows, test.hashes));
    expect(withKey.get(ledgerKey(plain, 1))).toMatchObject({ status: "erased" });
    const withoutKey = await test.db.forOrg(agency, (tx) => lookUpLedger(tx, sheetId, rows, null));
    expect(withoutKey.size).toBe(0);
  });

  it("looks up 20,000 rows in chunks of 1,000, one statement each", async () => {
    const { agency, sheetId } = await sheetWithRows([{ cells: ["row-5"], status: "added", rowNumber: 7 }]);
    const rows = read(Array.from({ length: 20_000 }, (_, index) => [`row-${String(index)}`]));
    let statements = 0;
    const counted = await test.db.forOrg(agency, async (tx) => {
      const original = tx.sheetRow.findMany.bind(tx.sheetRow);
      const spy = new Proxy(tx, {
        get(target, property, receiver) {
          if (property !== "sheetRow") return Reflect.get(target, property, receiver) as unknown;
          return new Proxy(target.sheetRow, {
            get(model, name) {
              if (name !== "findMany") return Reflect.get(model, name) as unknown;
              return (...args: Parameters<typeof original>) => {
                statements += 1;
                return original(...args);
              };
            },
          });
        },
      });
      return lookUpLedger(spy, sheetId, rows, test.hashes);
    });
    expect(statements).toBe(20);
    expect(counted.size).toBe(1);
  });
});

describe("clearVanishedRows", () => {
  it("marks a vanished not_added row resolved at the read that covers its place, and drops a vanished pending row", async () => {
    const { agency, sheetId } = await sheetWithRows([
      { cells: ["gone problem"], status: "not_added", rowNumber: 5 },
      { cells: ["still here"], status: "not_added", rowNumber: 6 },
      { cells: ["gone waiting"], status: "pending", rowNumber: 7 },
      { cells: ["added row"], status: "added", rowNumber: 8 },
    ]);
    const result = await test.db.forOrg(agency, (tx) =>
      clearVanishedRows(tx, sheetId, { read: read([["still here"], ["added row"]], 6), fromRow: 2, full: true }, now),
    );
    expect(result).toEqual({ resolved: 1, dropped: 1 });
    const rows = await test.db.forOrg(agency, (tx) => tx.sheetRow.findMany({ where: { connectionId: sheetId } }));
    expect(rows.map((row) => [row.status, row.resolvedAt !== null]).sort()).toEqual([
      ["added", false],
      ["not_added", false],
      ["not_added", true],
    ]);
  });

  it("leaves a not_added row alone when the read does not cover its place", async () => {
    const { agency, sheetId } = await sheetWithRows([
      { cells: ["problem row 12"], status: "not_added", rowNumber: 12 },
      { cells: ["waiting row 12"], status: "pending", rowNumber: 13 },
    ]);
    const result = await test.db.forOrg(agency, (tx) =>
      clearVanishedRows(tx, sheetId, { read: read([["newest"]], 300), fromRow: 300, full: false }, now),
    );
    expect(result).toEqual({ resolved: 0, dropped: 0 });
    // A window that covers them clears both.
    const covering = await test.db.forOrg(agency, (tx) =>
      clearVanishedRows(tx, sheetId, { read: read([["newest"]], 300), fromRow: 10, full: false }, now),
    );
    expect(covering).toEqual({ resolved: 1, dropped: 1 });
  });
});
