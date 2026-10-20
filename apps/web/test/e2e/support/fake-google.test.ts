// The journeys' fake Google, read by the real adapter exactly as the api and the worker read it: a sheet and its rows,
// each of Google's refusals as its reason, and the control surface's changes to a sheet.
import { createRealGoogleSheets, GoogleSheetsError } from "@travel-crm/integrations/google-sheets";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeGoogle, type FakeGoogle } from "./fake-google";

let fake: FakeGoogle;
let google: ReturnType<typeof createRealGoogleSheets>;

beforeAll(async () => {
  fake = await startFakeGoogle();
  google = createRealGoogleSheets({
    accounts: [{ client_email: await fake.client.accountEmail(), private_key: "unused" }],
    apiBaseUrl: fake.url,
    accessToken: () => Promise.resolve("test-token"),
  });
});

afterAll(async () => {
  await fake.stop();
});

const header = ["Timestamp", "Full name", "Phone number"];
const tabOptions = (fromRow = 2) => ({
  tabTitle: "Form responses 1",
  fromRow,
  maxRows: 100,
  maxColumns: 50,
  maxCellLength: 4000,
});

async function aSheet(
  id: string,
  rows: string[][] = [header, ["19/10/2026 14:00:00", "Asha", "+919876500101"]],
  share = true,
) {
  await fake.client.addSpreadsheet({ id, title: "Goa", tabs: [{ gid: "0", title: "Form responses 1", rows }] });
  if (share) await fake.client.share(id);
}

describe("the fake Google", () => {
  it("describes a sheet and reads its rows as the real adapter asks for them", async () => {
    await aSheet("sheet-one");
    const described = await google.describe(0, "sheet-one", {});
    expect(described).toMatchObject({ title: "Goa", chosenTab: { gid: "0", title: "Form responses 1" }, header });
    expect(described.sampleRows).toEqual([["19/10/2026 14:00:00", "Asha", "+919876500101"]]);
    const read = await google.readRows(0, "sheet-one", tabOptions());
    expect(read.header).toEqual(header);
    expect(read.rows).toEqual([{ rowNumber: 2, cells: ["19/10/2026 14:00:00", "Asha", "+919876500101"] }]);
    expect(read.lastRow).toBe(2);
  });

  it("shows rows appended, inserted, edited, sorted and deleted, with true row numbers", async () => {
    await aSheet("sheet-two", [header, ["t", "Zed", "1"], ["t", "Amy", "2"]]);
    await fake.client.append("sheet-two", "Form responses 1", ["t", "Bo", "3"]);
    await fake.client.insertAt("sheet-two", "Form responses 1", 3, ["t", "Mid", "4"]);
    await fake.client.editCell("sheet-two", "Form responses 1", 2, 2, "99");
    const names = async () => (await google.readRows(0, "sheet-two", tabOptions())).rows.map((row) => row.cells[1]);
    expect(await names()).toEqual(["Zed", "Mid", "Amy", "Bo"]);
    await fake.client.sort("sheet-two", "Form responses 1", { column: 1 });
    expect(await names()).toEqual(["Amy", "Bo", "Mid", "Zed"]);
    await fake.client.deleteAt("sheet-two", "Form responses 1", 2);
    expect(await names()).toEqual(["Bo", "Mid", "Zed"]);
    const tail = await google.readRows(0, "sheet-two", tabOptions(3));
    expect(tail.rows.map((row) => row.rowNumber)).toEqual([3, 4]);
  });

  it("answers each of Google's refusals as its reason", async () => {
    await aSheet("sheet-three", undefined, false);
    await expect(google.describe(0, "sheet-three", {})).rejects.toMatchObject({ reason: "not_shared" });
    await expect(google.describe(0, "no-such-sheet", {})).rejects.toMatchObject({ reason: "not_found" });
    await fake.client.share("sheet-three");
    await expect(google.readRows(0, "sheet-three", { ...tabOptions(), tabTitle: "Gone" })).rejects.toMatchObject({
      reason: "tab_missing",
    });
    await fake.client.addSpreadsheet({ id: "excel", title: "Leads.xlsx", kind: "excel", tabs: [] });
    await fake.client.share("excel");
    await expect(google.describe(0, "excel", {})).rejects.toMatchObject({ reason: "not_a_sheet" });
    await fake.client.failNext("rate_limited", { retryAfterSeconds: 7 });
    await expect(google.describe(0, "sheet-three", {})).rejects.toMatchObject({
      reason: "rate_limited",
      retryAfterSeconds: 7,
    });
    await fake.client.failNext("unavailable");
    await expect(google.describe(0, "sheet-three", {})).rejects.toBeInstanceOf(GoogleSheetsError);
    await fake.client.unshare("sheet-three");
    await expect(google.describe(0, "sheet-three", {})).rejects.toMatchObject({ reason: "not_shared" });
    await fake.client.deleteSpreadsheet("sheet-three");
  });

  it("counts the calls it answered", async () => {
    const before = await fake.client.calls();
    await aSheet("sheet-four");
    await google.describe(0, "sheet-four", {});
    const after = await fake.client.calls();
    expect(after.total).toBeGreaterThan(before.total);
    expect(after.describes).toBeGreaterThan(before.describes);
  });
});
