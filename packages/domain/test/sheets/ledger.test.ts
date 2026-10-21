// The ledger: a row is known whatever row it moved to, by its hash and occurrence, plain or re-keyed; waiting rows are read
// again; problems and waiting rows that left the sheet are cleared at the read that covers their place.
import { afterAll, describe, expect, it } from "vitest";
import {
  clearVanishedRows,
  isKnown,
  ledgerKey,
  lookUpLedger,
  numberRows,
  refreshRowNumbers,
  rowHash,
} from "../../src/sheets/index.js";
import { aSheet, aSheetRow, anAgency, createTestSheets, memberOf } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

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
  it("drops a vanished problem, hidden or not, and a vanished waiting row at the read that covers their place", async () => {
    const { agency, sheetId } = await sheetWithRows([
      { cells: ["gone problem"], status: "not_added", rowNumber: 5 },
      { cells: ["gone hidden problem"], status: "not_added", rowNumber: 4, resolvedAt: new Date() },
      { cells: ["still hidden"], status: "not_added", rowNumber: 3, resolvedAt: new Date() },
      { cells: ["still here"], status: "not_added", rowNumber: 6 },
      { cells: ["gone waiting"], status: "pending", rowNumber: 7 },
      { cells: ["added row"], status: "added", rowNumber: 8 },
    ]);
    const result = await test.db.forOrg(agency, (tx) =>
      clearVanishedRows(tx, sheetId, {
        read: read([["still here"], ["added row"], ["still hidden"]], 6),
        fromRow: 2,
        full: true,
      }),
    );
    expect(result).toEqual({ resolved: 2, dropped: 1 });
    const rows = await test.db.forOrg(agency, (tx) => tx.sheetRow.findMany({ where: { connectionId: sheetId } }));
    expect(rows.map((row) => [row.status, row.resolvedAt !== null]).sort()).toEqual([
      ["added", false],
      ["not_added", false],
      ["not_added", true],
    ]);
  });

  it("never clears a problem or a waiting row on a window read, only on a full one (M2)", async () => {
    const { agency, sheetId } = await sheetWithRows([
      { cells: ["problem row 12"], status: "not_added", rowNumber: 12 },
      { cells: ["waiting row 12"], status: "pending", rowNumber: 13 },
    ]);
    // Rows sorted or inserted above leave stale numbers, so a window can not tell what left the sheet.
    const window = await test.db.forOrg(agency, (tx) =>
      clearVanishedRows(tx, sheetId, { read: read([["newest"]], 300), fromRow: 10, full: false }),
    );
    expect(window).toEqual({ resolved: 0, dropped: 0 });
    const full = await test.db.forOrg(agency, (tx) =>
      clearVanishedRows(tx, sheetId, { read: read([["newest"]], 2), fromRow: 2, full: true }),
    );
    expect(full).toEqual({ resolved: 1, dropped: 1 });
  });
});

describe("refreshRowNumbers", () => {
  it("brings the numbers of known rows to where a full read found them, in one statement a thousand", async () => {
    const { agency, sheetId } = await sheetWithRows([
      { cells: ["Asha"], status: "added", rowNumber: 2 },
      { cells: ["Ravi"], status: "before_connect", rowNumber: 3 },
      { cells: ["Meena"], status: "added", rowNumber: 4 },
    ]);
    // Sorted, with one row inserted above: every number moved.
    const rows = read([["Zoya"], ["Meena"], ["Asha"], ["Ravi"]]);
    await test.db.forOrg(agency, async (tx) => {
      const ledger = await lookUpLedger(tx, sheetId, rows, test.hashes);
      await refreshRowNumbers(tx, sheetId, rows, ledger);
    });
    const stored = await test.db.forOrg(agency, (tx) => tx.sheetRow.findMany({ where: { connectionId: sheetId } }));
    const numberOf = (cells: string[]) => {
      const row = numberRows([{ rowNumber: 1, cells }])[0];
      return stored.find((entry) => row !== undefined && Buffer.from(entry.rawHash).equals(Buffer.from(row.hash)))
        ?.rowNumber;
    };
    expect([numberOf(["Meena"]), numberOf(["Asha"]), numberOf(["Ravi"])]).toEqual([3, 4, 5]);
  });
});
