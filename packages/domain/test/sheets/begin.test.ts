// "Check the sheet" (S5): a draft from a shared sheet with its tab, header and an account; each failure its own reason;
// one connection per tab; five sheets at most, drafts counted, two begins at once taking one place; the claim given back
// when the limit refuses; and no title, link, id, key or cell in an error's message.
import { afterAll, describe, expect, it } from "vitest";
import { DomainError } from "../../src/kernel/index.js";
import { beginSheet, maxSheetsPerOrganization } from "../../src/sheets/index.js";
import { aSheet, aGoogleSheet, aSpreadsheetId, anAgency, createTestSheets, memberOf } from "./support/sheets.js";
import { takeSpreadsheetClaim } from "../../src/sheets/index.js";

const test = createTestSheets();
afterAll(() => test.close());

const now = new Date("2026-10-19T10:00:00Z");
const header = ["Timestamp", "Full name", "Phone number", "Email Address"];
const begin = (agency: string, id: string, gid: string | null = null) =>
  beginSheet(test.db, test.dependencies, memberOf(agency), { spreadsheetId: id, gid }, now);
const reasonOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).reason;
};

describe("beginSheet", () => {
  it("makes a draft from a shared sheet, with its tab, header and an account", async () => {
    const agency = await anAgency(test);
    const id = aGoogleSheet(test, {
      id: aSpreadsheetId(),
      title: "Goa Diwali campaign (Responses)",
      tabTitle: "Form responses 1",
      gid: "812",
      rows: [header, ["19/10/2026 14:32:10", "Asha", "98765 43210", "asha@example.test"]],
    });
    const { sheetId } = await begin(agency, id);
    const stored = await test.db.forOrg(agency, async (tx) => ({
      sheet: await tx.sheetConnection.findUniqueOrThrow({ where: { id: sheetId } }),
      columns: await tx.sheetColumn.findMany({ where: { connectionId: sheetId }, orderBy: { id: "asc" } }),
    }));
    expect(stored.sheet).toMatchObject({
      status: "connecting",
      step: "tab",
      spreadsheetId: id,
      tabGid: "812",
      tabTitle: "Form responses 1",
      sheetTitle: "Goa Diwali campaign (Responses)",
      sheetLocale: "en_IN",
      sheetTimeZone: "Asia/Kolkata",
      serviceAccountIndex: 0,
      cursorRow: 1,
      existingRows: null,
    });
    expect(stored.sheet.claimId).not.toBeNull();
    expect(stored.columns.map((column) => [column.header, column.headerKey, column.field])).toEqual([
      ["Timestamp", "timestamp", null],
      ["Full name", "fullname", null],
      ["Phone number", "phonenumber", null],
      ["Email Address", "emailaddress", null],
    ]);
    // One read of Google, none of the rows.
    expect(test.google.calls.describes).toBeGreaterThan(0);
  });

  it("names a repeated header (2), a blank one by its letter, and keeps two headers of one key apart", async () => {
    const agency = await anAgency(test);
    const id = aGoogleSheet(test, { id: aSpreadsheetId(), rows: [["Name", "", "name", "Phone No", "PhoneNo", "###"]] });
    const { sheetId } = await begin(agency, id);
    const columns = await test.db.forOrg(agency, (tx) =>
      tx.sheetColumn.findMany({ where: { connectionId: sheetId }, orderBy: { id: "asc" } }),
    );
    expect(columns.map((column) => column.header)).toEqual([
      "Name",
      "Column B",
      "name (2)",
      "Phone No",
      "PhoneNo",
      "###",
    ]);
    expect(new Set(columns.map((column) => column.headerKey)).size).toBe(6);
    expect(columns.every((column) => column.headerKey !== "")).toBe(true);
  });

  it("picks the tab the link names, else the first grid tab", async () => {
    const agency = await anAgency(test);
    const id = aGoogleSheet(test, {
      id: aSpreadsheetId(),
      rows: [header],
      more: [{ gid: "77", title: "Walk-ins", rows: [["Name", "Mobile"]] }],
    });
    const named = await begin(agency, id, "77");
    const first = await begin(agency, id);
    const tabs = await test.db.forOrg(agency, async (tx) =>
      (await tx.sheetConnection.findMany({ where: { id: { in: [named.sheetId, first.sheetId] } } })).map(
        (sheet) => [sheet.id, sheet.tabTitle] as const,
      ),
    );
    expect(new Map(tabs).get(named.sheetId)).toBe("Walk-ins");
    expect(new Map(tabs).get(first.sheetId)).toBe("Form responses 1");
  });

  it("answers each failure with its reason: not set up, not shared (403 and 404), not a Google Sheet, empty, unavailable", async () => {
    const agency = await anAgency(test);
    const notSetUp = beginSheet(
      test.db,
      { google: null, hashes: test.hashes },
      memberOf(agency),
      { spreadsheetId: aSpreadsheetId(), gid: null },
      now,
    );
    expect(await reasonOf(notSetUp)).toBe("SHEETS_NOT_SET_UP");
    const noKey = beginSheet(
      test.db,
      { google: test.google, hashes: null },
      memberOf(agency),
      { spreadsheetId: aSpreadsheetId(), gid: null },
      now,
    );
    expect(await reasonOf(noKey)).toBe("SHEETS_NOT_SET_UP");

    // 403: the sheet exists but isn't shared. 404: it doesn't exist.
    const unshared = aGoogleSheet(test, { id: aSpreadsheetId() }, false);
    expect(await reasonOf(begin(agency, unshared))).toBe("SHEET_NOT_SHARED");
    expect(await reasonOf(begin(agency, aSpreadsheetId()))).toBe("SHEET_NOT_SHARED");

    const excel = aSpreadsheetId();
    test.google.addSpreadsheet({ id: excel, title: "Leads.xlsx", kind: "excel", tabs: [] });
    test.google.share(excel, test.accountEmail);
    expect(await reasonOf(begin(agency, excel))).toBe("SHEET_NOT_GOOGLE_SHEET");

    const emptyHeader = aGoogleSheet(test, { id: aSpreadsheetId(), rows: [["", "  "]] });
    expect(await reasonOf(begin(agency, emptyHeader))).toBe("SHEET_EMPTY");
    const noRows = aGoogleSheet(test, { id: aSpreadsheetId(), rows: [] });
    expect(await reasonOf(begin(agency, noRows))).toBe("SHEET_EMPTY");

    const busy = aGoogleSheet(test, { id: aSpreadsheetId() });
    for (const reason of ["rate_limited", "unavailable", "too_large"] as const) {
      test.google.failNext(reason);
      expect(await reasonOf(begin(agency, busy)), reason).toBe("SHEETS_UNAVAILABLE");
    }
    // Nothing was kept by a failure: no claim, no draft.
    const count = await test.db.forOrg(agency, (tx) => tx.sheetConnection.count());
    expect(count).toBe(0);
  });

  it("refuses the same spreadsheet and tab twice in one agency, and allows another tab of it", async () => {
    const agency = await anAgency(test);
    const id = aGoogleSheet(test, {
      id: aSpreadsheetId(),
      rows: [header],
      more: [{ gid: "5", title: "Other", rows: [["Name", "Phone"]] }],
    });
    await begin(agency, id);
    expect(await reasonOf(begin(agency, id))).toBe("SHEET_ALREADY_CONNECTED");
    expect(await reasonOf(begin(agency, id, "0"))).toBe("SHEET_ALREADY_CONNECTED");
    await expect(begin(agency, id, "5")).resolves.toBeDefined();
  });

  it("refuses a spreadsheet another agency holds, naming nothing", async () => {
    const [one, two] = [await anAgency(test), await anAgency(test, "Second agency")];
    const id = aGoogleSheet(test, { id: aSpreadsheetId() });
    await begin(one, id);
    const refusal = await begin(two, id).catch((error: unknown) => error);
    expect(refusal).toMatchObject({ reason: "SHEET_CLAIMED_ELSEWHERE" });
    expect(await test.db.forOrg(two, (tx) => tx.sheetConnection.count())).toBe(0);
  });

  it("holds the fifth sheet and refuses the sixth, drafts included, with two begins at once taking one place", async () => {
    const agency = await anAgency(test);
    const importer = memberOf(agency);
    await test.db.forOrg(agency, async (tx) => {
      for (let index = 0; index < maxSheetsPerOrganization - 2; index += 1) {
        await aSheet(tx, { connectedBy: importer.userId, status: index === 0 ? "connecting" : "running" });
      }
    });
    // Three sheets and a draft among them; two begins at once for the fifth place.
    await test.db.forOrg(agency, (tx) => aSheet(tx, { connectedBy: importer.userId, status: "connecting" }));
    const [a, b] = [aGoogleSheet(test, { id: aSpreadsheetId() }), aGoogleSheet(test, { id: aSpreadsheetId() })];
    const results = await Promise.allSettled([begin(agency, a), begin(agency, b)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((result) => result.status === "rejected");
    expect(lost?.reason).toMatchObject({ code: "LIMIT_REACHED", reason: "SHEET_LIMIT_REACHED" });
    expect(await test.db.forOrg(agency, (tx) => tx.sheetConnection.count())).toBe(maxSheetsPerOrganization);
    // A disconnected sheet frees its place.
    await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.updateMany({ where: { status: "running" }, data: { status: "disconnected" } }),
    );
    const c = aGoogleSheet(test, { id: aSpreadsheetId() });
    await expect(begin(agency, c)).resolves.toBeDefined();
  });

  it("releases a claim it just took when the limit refuses, and keeps one the agency already held", async () => {
    const agency = await anAgency(test);
    const importer = memberOf(agency);
    await test.db.forOrg(agency, async (tx) => {
      for (let index = 0; index < maxSheetsPerOrganization; index += 1) {
        await aSheet(tx, { connectedBy: importer.userId });
      }
    });
    const refused = aGoogleSheet(test, { id: aSpreadsheetId() });
    expect(await reasonOf(begin(agency, refused))).toBe("SHEET_LIMIT_REACHED");
    // The claim went back: another agency may take the spreadsheet.
    const other = await anAgency(test, "Free to claim");
    await expect(
      takeSpreadsheetClaim(test.db, other, test.hashes.spreadsheetHash(refused), now),
    ).resolves.toMatchObject({ created: true });

    // A claim the agency already held (a running sheet of the spreadsheet) stays when its second tab is refused.
    const held = aSpreadsheetId();
    const { claimId } = await takeSpreadsheetClaim(test.db, agency, test.hashes.spreadsheetHash(held), now);
    await test.db.forOrg(agency, (tx) => aSheet(tx, { connectedBy: importer.userId, spreadsheetId: held, claimId }));
    aGoogleSheet(test, { id: held, more: [{ gid: "9", title: "Tab two", rows: [["Name"]] }] });
    expect(await reasonOf(begin(agency, held, "9"))).toBe("SHEET_LIMIT_REACHED");
    const third = await anAgency(test, "Still refused");
    await expect(takeSpreadsheetClaim(test.db, third, test.hashes.spreadsheetHash(held), now)).rejects.toMatchObject({
      reason: "SHEET_CLAIMED_ELSEWHERE",
    });
  });

  it("keeps no title, link, id, key or cell in an error's message", async () => {
    const agency = await anAgency(test);
    const secretTitle = "Rahul Sharma's honeymoon enquiries";
    const id = aGoogleSheet(test, { id: aSpreadsheetId(), title: secretTitle, rows: [["", ""]] });
    const failures = [
      begin(agency, id),
      begin(agency, aSpreadsheetId()),
      (async () => {
        test.google.failNext("unavailable");
        await begin(agency, id);
      })(),
    ];
    for (const outcome of await Promise.allSettled(failures)) {
      const error = (outcome.status === "rejected" ? outcome.reason : null) as Error;
      for (const secret of [secretTitle, id, "docs.google.com", "Rahul", test.accountEmail, agency]) {
        expect(error.message).not.toContain(secret);
      }
    }
  });

  it("opens a sheet shared with any of the service accounts, and keeps the one that opened it", async () => {
    const two = createTestSheets({ accounts: 2 });
    try {
      const agency = await anAgency(two);
      for (const [shareWith, expected] of [
        [1, 1],
        [0, 0],
      ] as const) {
        const id = aGoogleSheet(two, { id: aSpreadsheetId() }, false);
        two.google.share(id, two.google.accounts()[shareWith]?.email ?? "");
        const { sheetId } = await beginSheet(
          two.db,
          two.dependencies,
          memberOf(agency),
          { spreadsheetId: id, gid: null },
          now,
        );
        const stored = await two.db.forOrg(agency, (tx) =>
          tx.sheetConnection.findUniqueOrThrow({ where: { id: sheetId } }),
        );
        expect(stored.serviceAccountIndex).toBe(expected);
      }
      // Shared with neither: the one refusal.
      const neither = aGoogleSheet(two, { id: aSpreadsheetId() }, false);
      const refusal = beginSheet(
        two.db,
        two.dependencies,
        memberOf(agency),
        { spreadsheetId: neither, gid: null },
        now,
      );
      expect(await reasonOf(refusal)).toBe("SHEET_NOT_SHARED");
    } finally {
      await two.close();
    }
  });
});
