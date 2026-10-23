// The save of a check's rows (S25): fifty to a transaction, the connection held first, each outcome and the counters written
// in it, the rules applied again, a unique violation settled by a second look, a row with an outcome never saved again.
import { randomUUID } from "node:crypto";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, describe, expect, it } from "vitest";
import { checkLeadSheet } from "../../../src/crm/index.js";
import { planSheetRows, type SheetRowDecision } from "../../../src/crm/lead-sheets/index.js";
import { saveSheetBatch, type SaveBatchContext } from "../../../src/crm/lead-sheets/sheet-save.js";
import { fakeIdentity } from "../../imports/support/test-imports.js";
import { aBatch } from "../../imports/support/batches.js";
import { aLead, aPerson, freshPhone } from "../support/records.js";
import { aRunningSheet, anAgency, checkDependencies, createTestSheets, memberOf } from "../../sheets/support/sheets.js";
import { formHeader, readFormRow } from "./support.js";
import type { Database } from "@travel-crm/db";

const test = createTestSheets();

/** What the check plans for one row read as the form's answer. */
function decide(read: ReturnType<typeof readFormRow>): SheetRowDecision {
  const [decision] = planSheetRows([
    {
      row: read.row,
      reading: read.reading,
      ledger: undefined,
      mode: "scheduled",
      isErased: () => false,
      isBlocked: () => false,
      earlier: new Map(),
      baseline: new Set(),
    },
  ]);
  if (decision === undefined) throw new Error("No decision");
  return decision;
}
afterAll(() => test.close());

const FIELDS = { timestamp: "enquiry_date", fullname: "name", phonenumber: "phone", emailaddress: "email" };
const HEADER = ["Timestamp", "Full name", "Phone number", "Email Address"];
const row = (name: string, phone: string) => ["19/10/2026 14:00:00", name, phone, ""];

async function running() {
  const agency = await anAgency(test);
  const importer = memberOf(agency);
  const identity = fakeIdentity({ access: importer, firstOwner: importer.userId });
  const sheet = await aRunningSheet(test, importer, { rows: [HEADER], fields: FIELDS, identity });
  const context: SaveBatchContext = {
    sheetId: sheet.sheetId,
    access: importer,
    hashes: test.hashes,
    workers: new Set([importer.userId]),
    defaultOwnerUserId: importer.userId,
    summarised: new Set(),
    now: new Date(),
  };
  /** Planned rows as the check plans them, for these answers. */
  const planned = (answers: string[][]) =>
    answers.map((cells, index) => {
      const read = readFormRow([...cells, "", "Goa", "", "", "", "", ""].slice(0, formHeader.length), {
        header: formHeader,
      });
      return { read, number: index + 2 };
    });
  return { agency, importer, identity, sheet, context, planned };
}

describe("saveSheetBatch", () => {
  it("saves 50 rows to a transaction, and writes each outcome and the counters in it", async () => {
    const { agency, importer, identity, sheet } = await running();
    for (let index = 0; index < 120; index += 1) {
      test.google.append(sheet.spreadsheetId, "Form responses 1", row(`Person ${String(index)}`, freshPhone()));
    }
    let batches = 0;
    const base = test.db;
    const counting: Database = {
      ...base,
      forOrg: (organizationId, work, options) => {
        if (options?.timeout === 15_000) batches += 1;
        return base.forOrg(organizationId, work, options);
      },
    };
    await checkLeadSheet(checkDependencies(test, { identity, db: counting }), {
      organizationId: agency,
      sheetId: sheet.sheetId,
      mode: "scheduled",
    });
    // Batches of 50, 50 and 20; a slow machine's clock may end one early, and then there are more of them.
    expect(batches).toBeGreaterThanOrEqual(3);
    const stored = await test.db.forOrg(agency, async (tx) => ({
      sheet: await tx.sheetConnection.findUniqueOrThrow({ where: { id: sheet.sheetId } }),
      rows: await tx.sheetRow.findMany({ where: { connectionId: sheet.sheetId, status: "added" } }),
    }));
    expect(stored.sheet.rowsAdded).toBe(120);
    expect(stored.rows).toHaveLength(120);
    expect(
      stored.rows.every((saved) => saved.leadId !== null && saved.personId !== null && saved.fingerprint !== null),
    ).toBe(true);
    expect(importer.userId).toBeTruthy();
  });

  it("writes one summary line per check: the connection, the rows read and what became of them, the time", async () => {
    const { agency, identity, sheet } = await running();
    test.google.append(sheet.spreadsheetId, "Form responses 1", row("Summary One", freshPhone()));
    test.google.append(sheet.spreadsheetId, "Form responses 1", row("Summary Two", freshPhone()));
    // Uncensored: the line is exactly what the check passed, so this proves the check's keys, not the censor.
    const logger = createMemoryLogger({ censor: false });
    await checkLeadSheet(
      { ...checkDependencies(test, { identity }), logger },
      { organizationId: agency, sheetId: sheet.sheetId, mode: "scheduled" },
    );
    const summaries = logger.entries.filter((entry) => entry.msg === "sheet check");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      level: "info",
      organizationId: agency,
      sheetId: sheet.sheetId,
      mode: "scheduled",
      result: "checked",
      rowsRead: 2,
      rowsAdded: 2,
      rowsMerged: 0,
      rowsDuplicate: 0,
      rowsWithProblems: 0,
    });
    expect(typeof summaries[0]?.durationMs).toBe("number");
    // Proven: the summary has ids, the mode, counts and a time, and no more: no name, phone, sheet title or row text.
    expect(Object.keys(summaries[0] ?? {}).sort()).toEqual([
      "durationMs",
      "level",
      "mode",
      "msg",
      "organizationId",
      "result",
      "rowsAdded",
      "rowsDuplicate",
      "rowsMerged",
      "rowsRead",
      "rowsWithProblems",
      "sheetId",
    ]);
    expect(JSON.stringify(logger.entries)).not.toMatch(/Summary|Person/);
  });

  it("applies the rules again: a contact blocked since the plan is left out", async () => {
    const { agency, sheet, context, planned } = await running();
    const phone = freshPhone();
    const [one] = planned([row("Blocked Person", phone)]);
    if (one === undefined) throw new Error("setup");
    const decision = decide(one.read);
    expect(decision.kind).toBe("save");
    // Blocked after the plan, before the save.
    await test.db.forOrg(agency, (tx) => tx.blockedContact.create({ data: { kind: "phone", value: phone } }));
    const result = await test.db.forOrg(agency, (tx) => saveSheetBatch(tx, context, [{ row: one.read.row, decision }]));
    expect(result).toMatchObject({ processed: 1, stopped: null });
    const stored = await test.db.forOrg(agency, async (tx) => ({
      rows: await tx.sheetRow.findMany({ where: { connectionId: sheet.sheetId } }),
      leads: await tx.lead.count(),
    }));
    expect(stored.leads).toBe(0);
    expect(stored.rows.map((saved) => [saved.status, saved.reasons])).toEqual([["not_added", ["blocked"]]]);
  });

  it("never saves a row with a known outcome again", async () => {
    const { agency, context, planned } = await running();
    const [one] = planned([row("Once Only", freshPhone())]);
    if (one === undefined) throw new Error("setup");
    const decision = decide(one.read);
    const batch = [{ row: one.read.row, decision }];
    await test.db.forOrg(agency, (tx) => saveSheetBatch(tx, context, batch));
    await test.db.forOrg(agency, (tx) => saveSheetBatch(tx, context, batch));
    expect(await test.db.forOrg(agency, (tx) => tx.lead.count())).toBe(1);
  });

  it("gives way to an import that is adding, before saving a row", async () => {
    const { agency, importer, sheet, context, planned } = await running();
    const [one] = planned([row("Waiting Person", freshPhone())]);
    if (one === undefined) throw new Error("setup");
    const decision = decide(one.read);
    await test.db.forOrg(agency, (tx) => aBatch(tx, { startedBy: importer.userId, status: "adding" }));
    const result = await test.db.forOrg(agency, (tx) => saveSheetBatch(tx, context, [{ row: one.read.row, decision }]));
    expect(result).toMatchObject({ processed: 0, stopped: "yielded" });
    expect(await test.db.forOrg(agency, (tx) => tx.sheetRow.count({ where: { connectionId: sheet.sheetId } }))).toBe(0);
  });

  it("stops at once for a sheet that was paused or disconnected meanwhile", async () => {
    const { agency, sheet, context, planned } = await running();
    const [one] = planned([row("Late Person", freshPhone())]);
    if (one === undefined) throw new Error("setup");
    const decision: SheetRowDecision = { kind: "pending" };
    await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.update({ where: { id: sheet.sheetId }, data: { status: "paused" } }),
    );
    const result = await test.db.forOrg(agency, (tx) => saveSheetBatch(tx, context, [{ row: one.read.row, decision }]));
    expect(result).toMatchObject({ processed: 0, stopped: "gone" });
  });

  it("runs a batch again once on a unique violation: two sheets bring the same new person at once", async () => {
    const agency = await anAgency(test);
    const importer = memberOf(agency);
    const identity = fakeIdentity({ access: importer, firstOwner: importer.userId });
    const one = await aRunningSheet(test, importer, { rows: [HEADER], fields: FIELDS, identity });
    const two = await aRunningSheet(test, importer, { rows: [HEADER], fields: FIELDS, identity });
    const phone = freshPhone();
    test.google.append(one.spreadsheetId, "Form responses 1", ["19/10/2026 14:00:00", "Same Person", phone, ""]);
    test.google.append(two.spreadsheetId, "Form responses 1", [
      "19/10/2026 14:01:00",
      "Same Person",
      phone,
      "x@example.test",
    ]);
    const check = (sheetId: string) =>
      checkLeadSheet(checkDependencies(test, { identity }), { organizationId: agency, sheetId, mode: "sync-now" });
    await Promise.all([check(one.sheetId), check(two.sheetId)]);
    expect(await test.db.forOrg(agency, (tx) => tx.lead.count())).toBe(1);
    const counts = await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.findMany({ select: { rowsAdded: true, rowsMerged: true, rowsDuplicate: true } }),
    );
    expect(counts.reduce((sum, sheet) => sum + sheet.rowsAdded, 0)).toBe(1);
    expect(counts.reduce((sum, sheet) => sum + sheet.rowsMerged, 0)).toBe(1);
  });

  it("gives a returning customer's new lead to the owner of their earlier lead, as the assignment decides", async () => {
    const { agency, context, planned } = await running();
    const previousOwner = randomUUID();
    const phone = freshPhone();
    const earlier = await test.db.forOrg(agency, async (tx) => {
      const person = await aPerson(tx, { phoneE164: phone });
      return aLead(tx, { personId: person.id, stage: "won", ownerUserId: previousOwner });
    });
    const [one] = planned([row("Returning Person", phone)]);
    if (one === undefined) throw new Error("setup");
    const decision = decide(one.read);
    await test.db.forOrg(agency, (tx) =>
      saveSheetBatch(tx, { ...context, workers: new Set([context.defaultOwnerUserId, previousOwner]) }, [
        { row: one.read.row, decision },
      ]),
    );
    const newest = await test.db.forOrg(agency, (tx) =>
      tx.lead.findFirstOrThrow({ where: { id: { not: earlier.id } } }),
    );
    expect(newest.ownerUserId).toBe(previousOwner);
  });
});
