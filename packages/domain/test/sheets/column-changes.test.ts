// A column inserted, deleted or moved changes every row's hash (spec 6.5, S18, S23): the rows already there at connect are
// known by what they hold, and the rows the sync added are duplicates of themselves, so nothing is ever added twice and no
// old sheet pours in as new leads. Fingerprints of the old rows are kept keyed, never plain.
import { afterAll, describe, expect, it } from "vitest";
import { rowFingerprint } from "../../src/imports/index.js";
import { createSheetsHashes } from "../../src/sheets/index.js";
import { freshPhone } from "../crm/support/records.js";
import { answer, HEADER, setup as setupSheet } from "./support/running.js";
import { createTestSheets, sheetsHashKey } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

type Running = Awaited<ReturnType<typeof setupSheet>>;

/** Replaces the whole tab with these rows, as a column inserted, deleted or moved does to every row. */
function rewrite(running: Running, rows: string[][]) {
  const { spreadsheetId } = running.sheet;
  test.google.deleteSpreadsheet(spreadsheetId);
  test.google.addSpreadsheet({
    id: spreadsheetId,
    title: "Goa Diwali campaign (Responses)",
    tabs: [{ gid: "0", title: "Form responses 1", rows }],
  });
  test.google.share(spreadsheetId, test.accountEmail);
}

/** The sheet's rows with a column "Budget" put in at the front of the answers. */
const withInsertedColumn = (rows: string[][]) =>
  rows.map((cells, index) => [cells[0] ?? "", index === 0 ? "Budget" : "50000", ...cells.slice(1)]);

const phones = [freshPhone(), freshPhone(), freshPhone()];
const oldRows = () => phones.map((phone, index) => answer(`Old Customer ${String(index)}`, phone, index + 1));

describe("a sheet whose columns change", () => {
  it("keeps a fingerprint, keyed, for every row there at connect", async () => {
    const running = await setupSheet(test, { rows: [HEADER, ...oldRows()] });
    const rows = await running.ledger();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === "before_connect")).toBe(true);
    const hashes = createSheetsHashes(sheetsHashKey);
    for (const row of rows) {
      expect(row.fingerprint).not.toBeNull();
      expect(row.fingerprint).toHaveLength(32);
      // Never the plain fingerprint: a guessed phone number can't be tested against it.
      expect(Buffer.from(row.fingerprint ?? []).equals(Buffer.alloc(32))).toBe(false);
    }
    expect(hashes.rekey(rowFingerprint("leads", [null]))).toHaveLength(32);
  });

  it("adds nothing when a column is inserted into a sheet of old rows, and counts nothing", async () => {
    const running = await setupSheet(test, { rows: [HEADER, ...oldRows()] });
    rewrite(running, withInsertedColumn([HEADER, ...oldRows()]));
    await running.check("scheduled");
    expect(await running.leads()).toHaveLength(0);
    const state = await running.state();
    expect([state.rowsAdded, state.rowsMerged, state.rowsDuplicate]).toEqual([0, 0, 0]);
    // The rows with their new hashes are known as they were: still there at connect, not problems, not new.
    const ledger = await running.ledger();
    expect(ledger.filter((row) => row.status === "before_connect").length).toBeGreaterThanOrEqual(3);
    expect(ledger.some((row) => row.status === "not_added" || row.status === "pending")).toBe(false);
    // And a new row in the changed sheet is still added.
    test.google.append(running.sheet.spreadsheetId, "Form responses 1", [
      "19/10/2026 14:09:00",
      "70000",
      "Fresh Customer",
      freshPhone(),
      "",
    ]);
    await running.check("sync-now");
    expect((await running.leads()).map((lead) => lead.person.name)).toEqual(["Fresh Customer"]);
  });

  it("adds nothing when a column is deleted or the columns are moved", async () => {
    const running = await setupSheet(test, { rows: [HEADER, ...oldRows()] });
    // The phone and the name swap places.
    const moved = [HEADER, ...oldRows()].map(([time, name, phone, email]) => [
      time ?? "",
      phone ?? "",
      name ?? "",
      email ?? "",
    ]);
    rewrite(running, moved);
    await running.check("scheduled");
    expect(await running.leads()).toHaveLength(0);
    // The email column deleted.
    rewrite(
      running,
      [HEADER, ...oldRows()].map(([time, name, phone]) => [time ?? "", name ?? "", phone ?? ""]),
    );
    await running.check("sync-now");
    expect(await running.leads()).toHaveLength(0);
  });

  it("adds a row the sync added only once when the columns move afterwards", async () => {
    const running = await setupSheet(test, { rows: [HEADER, ...oldRows()] });
    const phone = freshPhone();
    running.append(answer("Newcomer", phone, 9));
    await running.check("sync-now");
    expect(await running.leads()).toHaveLength(1);
    rewrite(running, withInsertedColumn([HEADER, ...oldRows(), answer("Newcomer", phone, 9)]));
    await running.check("sync-now");
    expect(await running.leads()).toHaveLength(1);
    const state = await running.state();
    expect(state.rowsAdded).toBe(1);
  });

  it("numbers a later copy of an old row as its second occurrence, though the window holds only the copy", async () => {
    // 150 rows: the window of a normal check starts at row 51, so the first row is above it.
    const old = Array.from({ length: 150 }, (_, index) => answer(`Old ${String(index)}`, freshPhone(), index));
    const running = await setupSheet(test, { rows: [HEADER, ...old] });
    running.append(old[0] ?? []);
    await running.check("scheduled");
    expect(await running.leads()).toHaveLength(0);
    const copies = (await running.ledger()).filter((row) => row.rowNumber === 152);
    // The copy is its own entry, the second of its cells, instead of being taken for the first.
    expect(copies.map((row) => row.occurrence)).toEqual([2]);
  });
});
