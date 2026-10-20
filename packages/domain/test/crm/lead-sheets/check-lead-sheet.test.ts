// The check (Review Focus 3, 4, 5): a row appended becomes a lead; nothing happens while the sheet isn't one to check;
// sort, insert and delete add nothing; two checks at once, or one retried after a crash, add each row once; an unfinished
// row waits one check; an edit is a repeat enquiry, never a second lead; a gap in the columns stops the check without
// consuming a row.
import type { Database } from "@travel-crm/db";
import { afterAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../../src/identity/index.js";
import { aBatch } from "../../imports/support/batches.js";
import { aLead, aPerson, freshPhone } from "../support/records.js";
import { aRunningSheet, anAgency, createTestSheets, memberOf } from "../../sheets/support/sheets.js";
import { answer, FIELDS, HEADER, setup as setupSheet } from "../../sheets/support/running.js";

const test = createTestSheets();
afterAll(() => test.close());
const setup = (options?: Parameters<typeof setupSheet>[1]) => setupSheet(test, options);

describe("checking a sheet", () => {
  it("adds a row appended to the sheet as a lead of the connector's choosing: source Google Sheet, New, the owner column's owner", async () => {
    const withOwner = await setup({
      rows: [
        [...HEADER, "Handled by"],
        ["19/10/2026 10:00:00", "Old Row", "+919800000001", "", ""],
      ],
      fields: { ...FIELDS, handledby: "owner" },
    });
    const phone = freshPhone();
    withOwner.append(["19/10/2026 14:32:10", "Asha Sharma", phone, "asha@example.test", "Asha"]);
    const outcome = await withOwner.check();
    expect(outcome).toMatchObject({ result: "checked", keepSchedule: true, nextCheckInSeconds: 120 });
    const [lead, ...others] = await withOwner.leads();
    expect(others).toHaveLength(0);
    expect(lead).toMatchObject({
      source: "google_sheet",
      sourceDetail: "Goa Diwali campaign (Responses) · Form responses 1",
      stage: "new",
      ownerUserId: withOwner.asha,
      returning: false,
    });
    expect(lead?.person).toMatchObject({ name: "Asha Sharma", phoneE164: phone, email: "asha@example.test" });
    expect(lead?.createdAt.toISOString()).toBe("2026-10-19T09:02:10.000Z");
    const state = await withOwner.state();
    expect(state).toMatchObject({
      rowsAdded: 1,
      rowsMerged: 0,
      rowsDuplicate: 0,
      status: "running",
      checkStartedAt: null,
    });
    expect(state.cursorRow).toBe(3);
    expect(state.lastCheckedAt).not.toBeNull();
    const ledger = await withOwner.ledger();
    expect(ledger.map((row) => row.status)).toEqual(["before_connect", "added"]);
    expect(ledger[1]).toMatchObject({ leadId: lead?.id, personId: lead?.personId });
    // Run again: the row is known, and nothing is added.
    await withOwner.check();
    expect(await withOwner.leads()).toHaveLength(1);
  });

  it("gives a row without an owner column to the agency Owner", async () => {
    const plain = await setup();
    plain.append(answer("Ravi Kumar", freshPhone()));
    await plain.check();
    expect((await plain.leads())[0]?.ownerUserId).toBe(plain.importer.userId);
  });

  it("does nothing when the sheet isn't running, a check started under five minutes ago, or the account is held", async () => {
    const paused = await setup();
    paused.append(answer("Asha", freshPhone()));
    await paused.inOrg((tx) =>
      tx.sheetConnection.update({ where: { id: paused.sheet.sheetId }, data: { status: "paused" } }),
    );
    const callsBefore = test.google.calls.total;
    expect(await paused.check()).toEqual({ result: "skipped", nextCheckInSeconds: 120, keepSchedule: false });
    expect(test.google.calls.total).toBe(callsBefore);

    const busy = await setup();
    busy.append(answer("Asha", freshPhone()));
    const now = new Date();
    await busy.inOrg((tx) =>
      tx.sheetConnection.update({
        where: { id: busy.sheet.sheetId },
        data: { checkStartedAt: new Date(now.getTime() - 60_000) },
      }),
    );
    expect(await busy.check("scheduled", {}, () => now)).toEqual({
      result: "skipped",
      nextCheckInSeconds: 120,
      keepSchedule: true,
    });

    const held = await setup();
    held.append(answer("Asha", freshPhone()));
    const holds = (await import("../../../src/sheets/index.js")).createAccountHolds();
    holds.backOff(0, new Date(), 100);
    const callsHeld = test.google.calls.total;
    const outcome = await held.check("scheduled", { holds });
    expect(outcome).toMatchObject({ result: "skipped", keepSchedule: true });
    expect(outcome.nextCheckInSeconds).toBeGreaterThan(95);
    expect(test.google.calls.total).toBe(callsHeld);
    expect(await paused.leads()).toHaveLength(0);
    expect(await held.leads()).toHaveLength(0);
  });

  it("does nothing, and tries again, while an import of the agency is adding", async () => {
    const one = await setup();
    one.append(answer("Asha", freshPhone()));
    await one.inOrg((tx) => aBatch(tx, { startedBy: one.importer.userId, status: "adding" }));
    const calls = test.google.calls.total;
    expect(await one.check()).toEqual({ result: "skipped", nextCheckInSeconds: 60, keepSchedule: true });
    expect(test.google.calls.total).toBe(calls);
    expect(await one.leads()).toHaveLength(0);
  });

  it("stops between batches when an import starts adding, leaving the cursor and the rest for the next check", async () => {
    const two = await setup();
    for (let index = 0; index < 120; index += 1) two.append(answer(`Person ${String(index)}`, freshPhone(), index));
    // The first batch of fifty saves; an import starts adding before the second.
    let batches = 0;
    const base = test.db;
    const watching: Database = {
      ...base,
      forOrg: async (organizationId, work, options) => {
        const result = await base.forOrg(organizationId, work, options);
        if (options?.timeout === 15_000 && (batches += 1) === 1) {
          await base.forOrg(organizationId, (tx) => aBatch(tx, { startedBy: two.importer.userId, status: "adding" }));
        }
        return result;
      },
    };
    const outcome = await two.check("scheduled", { db: watching });
    expect(outcome).toMatchObject({ result: "yielded", nextCheckInSeconds: 60 });
    // The first batch of up to fifty saved (a busy machine's clock may end it earlier); the rest waits.
    const saved = (await two.leads()).length;
    expect(saved).toBeGreaterThan(0);
    expect(saved).toBeLessThanOrEqual(50);
    const stopped = await two.state();
    expect(stopped.cursorRow).toBe(1);
    expect(stopped.checkStartedAt).toBeNull();
    await two.inOrg((tx) => tx.importBatch.updateMany({ data: { status: "stopped" } }));
    expect(await two.check()).toMatchObject({ result: "checked" });
    expect(await two.leads()).toHaveLength(120);
    expect((await two.state()).cursorRow).toBe(121);
  });

  it("reads nothing and keeps its cursor while the agency is read-only, then adds the waiting rows when it is active again", async () => {
    const readOnly = await setup();
    readOnly.append(answer("Asha", freshPhone()));
    const calls = test.google.calls.total;
    expect(await readOnly.check("scheduled", { access: "read_only" })).toEqual({
      result: "skipped",
      nextCheckInSeconds: 120,
      keepSchedule: true,
    });
    expect(test.google.calls.total).toBe(calls);
    expect((await readOnly.state()).cursorRow).toBe(1);
    expect((await readOnly.state()).status).toBe("running");
    await readOnly.check("scheduled", { access: "full" });
    expect(await readOnly.leads()).toHaveLength(1);
  });

  it("reads from the cursor less 100 rows, so a row inserted just above the end is met", async () => {
    const rows = [
      HEADER,
      ...Array.from({ length: 150 }, (_, index) => answer(`Old ${String(index)}`, freshPhone(), index)),
    ];
    const window = await setup({ rows });
    expect((await window.state()).cursorRow).toBe(151);
    test.google.insertAt(window.sheet.spreadsheetId, "Form responses 1", 140, answer("Late Arrival", freshPhone(), 55));
    expect(await window.check()).toMatchObject({ result: "checked" });
    const leads = await window.leads();
    expect(leads.map((lead) => lead.person.name)).toEqual(["Late Arrival"]);
    expect((await window.state()).cursorRow).toBe(152);
  });

  it("adds nothing for a sort, an insert in the middle or a deleted row, and a full read finds only the inserted one", async () => {
    const rows = [
      HEADER,
      ...Array.from({ length: 20 }, (_, index) => answer(`Old ${String(index)}`, freshPhone(), index)),
    ];
    const messy = await setup({ rows });
    const sheetId = messy.sheet.spreadsheetId;
    test.google.sort(sheetId, "Form responses 1", (a, b) => (b[1] ?? "").localeCompare(a[1] ?? ""));
    test.google.deleteAt(sheetId, "Form responses 1", 7);
    test.google.insertAt(sheetId, "Form responses 1", 10, answer("Brand New", freshPhone(), 58));
    await messy.check("sync-now");
    expect((await messy.leads()).map((lead) => lead.person.name)).toEqual(["Brand New"]);
    await messy.check("sync-now");
    expect(await messy.leads()).toHaveLength(1);
    expect(await messy.state()).toMatchObject({ rowsAdded: 1, rowsMerged: 0, rowsDuplicate: 0 });
  });

  it("adds each row once when two checks overlap", async () => {
    const racing = await setup();
    for (let index = 0; index < 8; index += 1) racing.append(answer(`Racer ${String(index)}`, freshPhone(), index));
    await Promise.all([racing.check("sync-now"), racing.check("sync-now")]);
    expect(await racing.leads()).toHaveLength(8);
    expect(await racing.state()).toMatchObject({ rowsAdded: 8, rowsMerged: 0, rowsDuplicate: 0 });
  });

  it("adds each row once when one is retried after a crash", async () => {
    const crashing = await setup();
    for (let index = 0; index < 120; index += 1) crashing.append(answer(`Row ${String(index)}`, freshPhone(), index));
    // The database goes away after the first batch: nothing more can be written, as when the worker is killed.
    let saved = false;
    const base = test.db;
    const failing: Database = {
      ...base,
      forOrg: (organizationId, work, options) => {
        if (saved) return Promise.reject(new Error("The worker was killed"));
        if (options?.timeout === 15_000) saved = true;
        return base.forOrg(organizationId, work, options);
      },
    };
    await expect(crashing.check("scheduled", { db: failing })).rejects.toThrow("The worker was killed");
    const before = (await crashing.leads()).length;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThanOrEqual(50);
    // A killed worker left its claim; it lapses after five minutes, and the next check carries on from the rows without an outcome.
    expect((await crashing.state()).checkStartedAt).not.toBeNull();
    expect(await crashing.check()).toMatchObject({ result: "skipped" });
    await crashing.check("scheduled", {}, () => new Date(Date.now() + 6 * 60_000));
    expect(await crashing.leads()).toHaveLength(120);
    const names = (await crashing.leads()).map((lead) => lead.person.name);
    expect(new Set(names).size).toBe(120);
    expect(await crashing.state()).toMatchObject({ rowsAdded: 120 });
  });

  it("reads every row since the cursor on the next check after a sleep of an hour", async () => {
    const slept = await setup();
    // The worker is asleep for an hour; forty answers arrive; no tick ran. The next check starts from the cursor.
    for (let index = 0; index < 40; index += 1) slept.append(answer(`Slept ${String(index)}`, freshPhone(), index));
    expect(await slept.leads()).toHaveLength(0);
    const hourLater = () => new Date(Date.now() + 60 * 60_000);
    expect(await slept.check("scheduled", {}, hourLater)).toMatchObject({ result: "checked" });
    expect((await slept.leads()).map((lead) => lead.person.name).sort()).toEqual(
      Array.from({ length: 40 }, (_, index) => `Slept ${String(index)}`).sort(),
    );
    await slept.check("scheduled", {}, hourLater);
    expect(await slept.leads()).toHaveLength(40);
    expect(await slept.state()).toMatchObject({ rowsAdded: 40, cursorRow: 41 });
  });

  it("holds an unfinished row one check, then lists it; the fixed row adds one lead and clears the line", async () => {
    const typing = await setup();
    typing.append(["19/10/2026 14:40:00", "Rahul Sharma", "", ""]);
    await typing.check();
    expect(await typing.leads()).toHaveLength(0);
    expect((await typing.ledger()).map((row) => row.status)).toEqual(["pending"]);
    await typing.check();
    expect((await typing.ledger()).map((row) => [row.status, row.reasons, row.exampleName])).toEqual([
      ["not_added", ["no_contact"], "Rahul Sharma"],
    ]);
    // Someone gives the row its phone: it reads as a new row, the lead is added and the old line clears.
    test.google.editCell(typing.sheet.spreadsheetId, "Form responses 1", 2, 2, freshPhone());
    await typing.check();
    expect(await typing.leads()).toHaveLength(1);
    // A window can not tell that the old cells left the sheet (rows moved above would leave stale numbers): the line
    // clears at the next full read (M2).
    expect((await typing.ledger()).map((row) => row.status).sort()).toEqual(["added", "not_added"]);
    await typing.check("sync-now");
    expect((await typing.ledger()).map((row) => row.status)).toEqual(["added"]);
    expect(await typing.state()).toMatchObject({ rowsAdded: 1 });
  });

  it("lists an unfinished row at once for Sync now", async () => {
    const button = await setup();
    button.append(["19/10/2026 14:40:00", "Rahul Sharma", "", ""]);
    await button.check("sync-now");
    expect((await button.ledger()).map((row) => row.status)).toEqual(["not_added"]);
  });

  it("reads an edited row as a new row: a repeat enquiry, never a second lead", async () => {
    const editing = await setup();
    const phone = freshPhone();
    editing.append(answer("Asha Sharma", phone, 3));
    await editing.check();
    expect(await editing.leads()).toHaveLength(1);
    test.google.editCell(editing.sheet.spreadsheetId, "Form responses 1", 2, 3, "asha.new@example.test");
    await editing.check();
    expect(await editing.leads()).toHaveLength(1);
    expect(await editing.state()).toMatchObject({ rowsAdded: 1, rowsMerged: 1 });
    const enquiries = await editing.inOrg<number>((tx) => tx.leadEnquiry.count());
    expect(enquiries).toBeGreaterThanOrEqual(1);
  });

  it("makes a later row for the same person a repeat enquiry on the lead the earlier row made", async () => {
    const twice = await setup();
    const phone = freshPhone();
    twice.append(answer("Asha Sharma", phone, 3));
    twice.append(["19/10/2026 14:09:00", "Asha Sharma", phone, "second@example.test"]);
    await twice.check();
    expect(await twice.leads()).toHaveLength(1);
    expect(await twice.state()).toMatchObject({ rowsAdded: 1, rowsMerged: 1, rowsDuplicate: 0 });
  });

  it("leaves a row identical to one added in the same sheet as a duplicate", async () => {
    const same = await setup();
    const row = answer("Asha Sharma", freshPhone(), 3);
    same.append(row);
    await same.check();
    // The same enquiry typed again on another line (another occurrence is a new row, but the same enquiry).
    same.append(row);
    await same.check();
    expect(await same.leads()).toHaveLength(1);
    expect(await same.state()).toMatchObject({ rowsAdded: 1, rowsDuplicate: 1 });
  });

  it("makes a new lead marked Returning for a person whose leads are all closed", async () => {
    const closed = await setup();
    const phone = freshPhone();
    await closed.inOrg(async (tx) => {
      const person = await aPerson(tx, { name: "Meena Iyer", phoneE164: phone });
      await aLead(tx, { personId: person.id, stage: "lost" });
    });
    closed.append(answer("Meena Iyer", phone, 4));
    await closed.check();
    const leads = await closed.leads();
    expect(leads).toHaveLength(2);
    expect(leads.find((lead) => lead.source === "google_sheet")).toMatchObject({ returning: true, stage: "new" });
  });

  it("leaves a person already at an open lead, added by hand, with one lead and a repeat enquiry", async () => {
    const open = await setup();
    const phone = freshPhone();
    await open.inOrg(async (tx) => {
      const person = await aPerson(tx, { name: "Kiran Rao", phoneE164: phone });
      await aLead(tx, { personId: person.id, stage: "contacted" });
    });
    open.append(answer("Kiran Rao", phone, 5));
    await open.check();
    expect(await open.leads()).toHaveLength(1);
    expect(await open.state()).toMatchObject({ rowsAdded: 0, rowsMerged: 1 });
  });

  it("counts added, added to an existing lead and duplicates exactly, in the rows' own transactions", async () => {
    const counting = await setup();
    const phone = freshPhone();
    counting.append(answer("A One", freshPhone(), 1));
    counting.append(answer("B Two", phone, 2));
    counting.append(["19/10/2026 14:03:00", "B Two", phone, "b@example.test"]);
    counting.append(answer("A One", freshPhone(), 1));
    await counting.check();
    expect((await counting.leads()).length).toBe(3);
    const state = await counting.state();
    expect([state.rowsAdded, state.rowsMerged, state.rowsDuplicate]).toEqual([3, 1, 0]);
  });
});

describe("the columns of a checked sheet", () => {
  const nameOnly = { fullname: "name", phonenumber: "phone" };

  it("stops without consuming a row while a needed column is missing, then adds the waiting rows when it returns", async () => {
    const gap = await setup({ rows: [["Full name", "Phone number", "Budget"]], fields: nameOnly });
    const sheetId = gap.sheet.spreadsheetId;
    gap.append(["Before", freshPhone(), "1"]);
    test.google.editCell(sheetId, "Form responses 1", 1, 1, "Mobile No");
    gap.append(["After", freshPhone(), "2"]);
    expect(await gap.check()).toMatchObject({ result: "checked" });
    const stopped = await gap.state();
    expect(stopped).toMatchObject({ status: "columns_missing", cursorRow: 1 });
    expect(stopped.attentionSince).not.toBeNull();
    expect(await gap.leads()).toHaveLength(0);
    expect(await gap.ledger()).toHaveLength(0);
    expect(await gap.inOrg<number>((tx) => tx.outboxEvent.count({ where: { type: "sheet.attention" } }))).toBe(1);
    // Still stopped: told once only.
    await gap.check();
    expect(await gap.inOrg<number>((tx) => tx.outboxEvent.count({ where: { type: "sheet.attention" } }))).toBe(1);
    // The column comes back: the rows that waited are added.
    test.google.editCell(sheetId, "Form responses 1", 1, 1, "Phone number");
    await gap.check();
    expect((await gap.state()).status).toBe("running");
    expect((await gap.leads()).map((lead) => lead.person.name).sort()).toEqual(["After", "Before"]);
  });

  it("only notes a missing column that no row needed", async () => {
    const budget = await setup({
      rows: [["Full name", "Phone number", "Budget"]],
      fields: { ...nameOnly, budget: "budget" },
    });
    test.google.editCell(budget.sheet.spreadsheetId, "Form responses 1", 1, 2, "Notes");
    budget.append(["Asha", freshPhone(), "x"]);
    await budget.check();
    expect((await budget.state()).status).toBe("running");
    expect(await budget.leads()).toHaveLength(1);
  });

  it("finds a matched column by its header after a column is inserted in front of it", async () => {
    const inserted = await setup();
    const sheetId = inserted.sheet.spreadsheetId;
    inserted.append(answer("Old One", freshPhone(), 1));
    inserted.append(answer("Old Two", freshPhone(), 2));
    await inserted.check();
    expect(await inserted.leads()).toHaveLength(2);
    // Someone inserts a "Source" column at the front and a new answer arrives.
    const phone = freshPhone();
    const current = (
      await test.google.readRows(0, sheetId, {
        tabTitle: "Form responses 1",
        fromRow: 2,
        maxRows: 100,
        maxColumns: 50,
        maxCellLength: 4000,
      })
    ).rows.map((row) => row.cells);
    test.google.deleteSpreadsheet(sheetId);
    test.google.addSpreadsheet({
      id: sheetId,
      title: "Goa Diwali campaign (Responses)",
      tabs: [
        {
          gid: "0",
          title: "Form responses 1",
          rows: [
            ["Source", ...HEADER],
            ...current.map((cells) => ["", ...cells]),
            ["Instagram", ...answer("Brand New", phone, 9)],
          ],
        },
      ],
    });
    test.google.share(sheetId, test.accountEmail);
    await inserted.check();
    const leads = await inserted.leads();
    expect(leads.map((lead) => lead.person.name).sort()).toEqual(["Brand New", "Old One", "Old Two"]);
    expect(leads.find((lead) => lead.person.name === "Brand New")?.person.phoneE164).toBe(phone);
    const state = await inserted.state();
    // The old rows moved their cells, and are the same enquiries: duplicates, not new leads.
    expect([state.rowsAdded, state.rowsDuplicate]).toEqual([3, 2]);
    const gained = await inserted.inOrg<{ header: string; isNew: boolean }[]>((tx) =>
      tx.sheetColumn.findMany({
        where: { connectionId: inserted.sheet.sheetId, isNew: true },
        select: { header: true, isNew: true },
      }),
    );
    expect(gained).toEqual([{ header: "Source", isNew: true }]);
  });

  it("reads the whole tab once the header changed", async () => {
    const renamed = await setup({ rows: [["Full name", "Phone number", "Remarks"]], fields: nameOnly });
    const fresh = new Date(Date.now() - 60_000);
    await renamed.inOrg((tx) =>
      tx.sheetConnection.update({ where: { id: renamed.sheet.sheetId }, data: { lastFullReadAt: fresh } }),
    );
    await renamed.check();
    expect((await renamed.state()).lastFullReadAt?.getTime()).toBe(fresh.getTime());
    test.google.editCell(renamed.sheet.spreadsheetId, "Form responses 1", 1, 2, "Comments");
    await renamed.check();
    expect((await renamed.state()).lastFullReadAt?.getTime()).toBeGreaterThan(fresh.getTime());
  });
});

describe("what Google hands back", () => {
  it("skips a million-row sheet's excess and a 10 MB cell without holding them", async () => {
    const agency = await anAgency(test);
    const importer: MemberAccess = memberOf(agency);
    const rows: string[][] = [HEADER, ["19/10/2026", "x".repeat(10_000_000), "", ""]];
    for (let index = 0; index < 1_000_000; index += 1) rows.push(["19/10/2026", "Row", "", ""]);
    const before = process.memoryUsage().heapUsed;
    const sheet = await aRunningSheet(test, importer, { rows, fields: FIELDS });
    const grown = process.memoryUsage().heapUsed - before;
    const state = await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.findUniqueOrThrow({ where: { id: sheet.sheetId } }),
    );
    const ledger = await test.db.forOrg(agency, (tx) => tx.sheetRow.count({ where: { connectionId: sheet.sheetId } }));
    // Only the first 20,000 rows are read (S33): identical rows are numbered, none beyond the limit is kept.
    expect(ledger).toBe(20_000);
    expect(state.rowsSeen).toBe(20_001);
    expect(state.cursorRow).toBe(20_001);
    // The rows the test itself holds are not the worker's: only what the baseline added counts.
    expect(grown).toBeLessThan(200 * 1024 * 1024);
  }, 120_000);
});
