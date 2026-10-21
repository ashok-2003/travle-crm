// The in-memory Google answers as Google does: sharing, tabs, edits, failures, and bounds.
import { beforeEach, describe, expect, it } from "vitest";
import {
  createMemoryGoogleSheets,
  GoogleSheetsError,
  type MemoryGoogleSheets,
  type ReadRowsOptions,
} from "@travel-crm/integrations/google-sheets";

const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aaa";
const header = ["Name", "Phone"];
const read = (tabTitle = "Form responses 1", fromRow = 2): ReadRowsOptions => ({
  tabTitle,
  fromRow,
  maxRows: 20_000,
  maxColumns: 50,
  maxCellLength: 4_000,
});

let google: MemoryGoogleSheets;
let email: string;

beforeEach(() => {
  google = createMemoryGoogleSheets();
  email = google.accounts()[0]?.email ?? "";
  google.addSpreadsheet({
    id,
    title: "Goa Diwali campaign",
    locale: "en_IN",
    timeZone: "Asia/Kolkata",
    tabs: [
      {
        gid: "0",
        title: "Form responses 1",
        rows: [header, ["Asha", "1"], ["Ravi", "2"], ["Meena", "3"], ["Kiran", "4"]],
      },
      { gid: "77", title: "Notes", rows: [["Note"]] },
    ],
  });
});

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GoogleSheetsError) return error.reason;
    throw error;
  }
  return "none";
}

describe("createMemoryGoogleSheets", () => {
  it("answers not_shared until the account is shared, then not_found after the sheet is deleted", async () => {
    expect(await reason(google.describe(0, id))).toBe("not_shared");
    google.share(id, email);
    expect(await reason(google.describe(0, id))).toBe("none");
    google.deleteSpreadsheet(id);
    expect(await reason(google.describe(0, id))).toBe("not_found");
    expect(await reason(google.readRows(0, "never-added", read()))).toBe("not_found");
  });

  it("describes title, locale, time zone, tabs, the first row and three rows below it, choosing the tab by gid, else the first grid tab", async () => {
    google.share(id, email);
    const first = await google.describe(0, id);
    expect(first).toMatchObject({ title: "Goa Diwali campaign", locale: "en_IN", timeZone: "Asia/Kolkata" });
    expect(first.tabs.map((tab) => tab.gid)).toEqual(["0", "77"]);
    expect(first.chosenTab?.title).toBe("Form responses 1");
    expect(first.header).toEqual(header);
    expect(first.sampleRows).toEqual([
      ["Asha", "1"],
      ["Ravi", "2"],
      ["Meena", "3"],
    ]);
    const second = await google.describe(0, id, { tabGid: "77" });
    expect(second.chosenTab?.title).toBe("Notes");
    expect(second.header).toEqual(["Note"]);
  });

  it("answers not_a_sheet for an Excel file and tab_missing for a tab read by its old title after renameTab", async () => {
    google.addSpreadsheet({ id: "excel-file-aaaaaaaaaaaaaaaaaaaa", title: "x", kind: "excel", tabs: [] });
    google.share("excel-file-aaaaaaaaaaaaaaaaaaaa", email);
    expect(await reason(google.describe(0, "excel-file-aaaaaaaaaaaaaaaaaaaa"))).toBe("not_a_sheet");
    google.share(id, email);
    google.renameTab(id, "0", "Responses");
    expect(await reason(google.readRows(0, id, read("Form responses 1")))).toBe("tab_missing");
    expect(await reason(google.readRows(0, id, read("Responses")))).toBe("none");
  });

  it("applies sort, insertAt, deleteAt, editCell and append to what readRows returns, with row numbers as a sheet has them", async () => {
    google.share(id, email);
    const names = async () =>
      (await google.readRows(0, id, read())).rows.map((row) => `${String(row.rowNumber)}:${row.cells[0] ?? ""}`);
    expect(await names()).toEqual(["2:Asha", "3:Ravi", "4:Meena", "5:Kiran"]);
    google.sort(id, "Form responses 1", (a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
    expect(await names()).toEqual(["2:Asha", "3:Kiran", "4:Meena", "5:Ravi"]);
    google.insertAt(id, "Form responses 1", 3, ["Zoya", "9"]);
    expect(await names()).toEqual(["2:Asha", "3:Zoya", "4:Kiran", "5:Meena", "6:Ravi"]);
    google.deleteAt(id, "Form responses 1", 2);
    google.editCell(id, "Form responses 1", 2, 1, "999");
    google.append(id, "Form responses 1", ["Dev", "5"]);
    const after = await google.readRows(0, id, read());
    expect(after.rows.map((row) => row.cells)).toEqual([
      ["Zoya", "999"],
      ["Kiran", "4"],
      ["Meena", "3"],
      ["Ravi", "2"],
      ["Dev", "5"],
    ]);
    expect(after.lastRow).toBe(6);
    expect(after.header).toEqual(header);
    google.rename(id, "Renamed");
    expect((await google.describe(0, id)).title).toBe("Renamed");
  });

  it("reads from a row, pads rows to the header and keeps blank rows so numbers stay true", async () => {
    google.share(id, email);
    google.append(id, "Form responses 1", []);
    google.append(id, "Form responses 1", ["Late"]);
    const result = await google.readRows(0, id, read("Form responses 1", 5));
    expect(result.rows).toEqual([
      { rowNumber: 5, cells: ["Kiran", "4"] },
      { rowNumber: 6, cells: ["", ""] },
      { rowNumber: 7, cells: ["Late", ""] },
    ]);
    expect(result.lastRow).toBe(7);
    expect((await google.readRows(0, id, read("Form responses 1", 50))).rows).toEqual([]);
  });

  it("fails the next call with any reason, rate_limited carrying retryAfterSeconds, for the times asked", async () => {
    google.share(id, email);
    google.failNext("rate_limited", { retryAfterSeconds: 120, times: 2 });
    for (let time = 0; time < 2; time += 1) {
      await expect(google.describe(0, id)).rejects.toMatchObject({ reason: "rate_limited", retryAfterSeconds: 120 });
    }
    expect(await reason(google.describe(0, id))).toBe("none");
    google.failNext("unavailable");
    expect(await reason(google.readRows(0, id, read()))).toBe("unavailable");
  });

  it("counts calls in total and by account", async () => {
    const two = createMemoryGoogleSheets({ accountEmails: ["a@x.test", "b@x.test"] });
    two.addSpreadsheet({ id, title: "t", tabs: [{ gid: "0", title: "T", rows: [header] }] });
    two.share(id, "a@x.test");
    two.share(id, "b@x.test");
    await two.describe(0, id);
    await two.readRows(1, id, read("T"));
    await two.readRows(1, id, read("T"));
    expect(two.calls).toMatchObject({ total: 3, describes: 1, reads: 2, byAccount: { 0: 1, 1: 2 } });
    await expect(two.describe(5, id)).rejects.toBeInstanceOf(RangeError);
  });

  it("bounds a million rows, a 10 MB cell and 5,000 columns", async () => {
    const wide = Array.from({ length: 5_000 }, (_, index) => `H${String(index)}`);
    const rows = [wide, ["x".repeat(10_000_000)]];
    for (let index = 0; index < 1_000_000; index += 1) rows.push(["r"]);
    const bigId = "big-sheet-aaaaaaaaaaaaaaaaaaaaaa";
    google.addSpreadsheet({ id: bigId, title: "big", tabs: [{ gid: "0", title: "Big", rows }] });
    google.share(bigId, email);
    const result = await google.readRows(0, bigId, read("Big"));
    expect(result.rows).toHaveLength(20_000);
    expect(result.truncated).toBe(true);
    expect(result.header).toHaveLength(50);
    expect(result.rows[0]?.cells).toHaveLength(50);
    expect(result.rows[0]?.cells[0]).toHaveLength(4_000);
  });
});
