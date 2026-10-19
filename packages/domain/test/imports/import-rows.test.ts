// An import's rows (spec B25-B27): the check's plans written 1,000 to a transaction with its progress, counted by plan
// and first reason in one pass, a page of examples by plan and reason, the next rows to add in row order, and each
// added row's outcome moving the progress.
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  findImport,
  importCounts,
  importRowsPage,
  markImportChecked,
  recordRowOutcomes,
  replaceImportRows,
  rowsToAdd,
  type ImportRowPlan,
} from "../../src/imports/index.js";
import { aBatch, aRow } from "./support/batches.js";
import { anAgency, countingContext, createTestImports, memberOf, type TestImports } from "./support/test-imports.js";

const plan = (rowNumber: number, overrides: Partial<ImportRowPlan> = {}): ImportRowPlan => ({
  rowNumber,
  plan: "new",
  reasons: [],
  noted: false,
  newDestination: null,
  exampleName: `Lead ${String(rowNumber)}`,
  exampleValue: null,
  ...overrides,
});

describe("an import's rows", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  it("writes 10,000 row plans 1,000 to a transaction, moving the progress", async () => {
    const { id } = await inOrg((tx) =>
      aBatch(tx, { startedBy: importer.userId, status: "checking", rowsTotal: 10_000 }),
    );
    await inOrg((tx) => aRow(tx, { batchId: id, rowNumber: 99_999 }));
    const { context, counted } = countingContext(test, organizationId);
    const plans = Array.from({ length: 10_000 }, (_, index) => plan(index + 2));
    await replaceImportRows(context, id, plans);
    expect(counted.transactions).toBe(10);
    expect(await inOrg((tx) => tx.importRow.count({ where: { batchId: id } }))).toBe(10_000);
    expect(await inOrg((tx) => findImport(tx, importer, "leads", id))).toMatchObject({ rowsDone: 10_000 });
    // A second run writes the same rows.
    await replaceImportRows(context, id, plans);
    expect(await inOrg((tx) => tx.importRow.count({ where: { batchId: id } }))).toBe(10_000);
    await inOrg((tx) =>
      markImportChecked(tx, id, { rowsTotal: 10_000, rowsToAdd: 9_000, rowsNewStage: 612 }, new Date()),
    );
    expect(await inOrg((tx) => findImport(tx, importer, "leads", id))).toMatchObject({
      status: "checked",
      rowsToAdd: 9_000,
      rowsNewStage: 612,
    });
  }, 60_000);

  it("counts the rows by plan and by first reason with one GROUP BY", async () => {
    const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, status: "checking", rowsNewStage: 2 }));
    await replaceImportRows(countingContext(test, organizationId).context, id, [
      plan(2),
      plan(3, { plan: "returning", noted: true }),
      plan(4, { plan: "enquiry", newDestination: "Goa" }),
      plan(5, { plan: "new", newDestination: "goa" }),
      plan(6, { plan: "blocked", reasons: [{ code: "blocked" }] }),
      plan(7, { plan: "not_added", reasons: [{ code: "no_contact" }, { code: "no_name" }] }),
      plan(8, { plan: "not_added", reasons: [{ code: "no_contact" }] }),
      plan(9, { plan: "not_added", reasons: [{ code: "same_as_row", row: 2 }] }),
    ]);
    const counts = await inOrg((tx) => importCounts(tx, { id, rowsNewStage: 2 }));
    expect(counts).toEqual({
      byPlan: { new: 2, returning: 1, enquiry: 1, blocked: 1, already_imported: 0, not_added: 3 },
      returning: 1,
      noted: 1,
      newStage: 2,
      notAdded: [
        { reason: "no_contact", rows: 2 },
        { reason: "same_as_row", rows: 1 },
      ],
      newDestinations: ["Goa"],
      outcomes: { added: 0, merged: 0, left_out: 0, not_added: 0 },
    });
    const page = await inOrg((tx) =>
      importRowsPage(tx, importer, "leads", { importId: id, plan: "not_added", reason: "no_contact", limit: 1 }),
    );
    expect(page).toEqual({
      items: [
        {
          rowNumber: 7,
          name: "Lead 7",
          value: null,
          reasons: [{ code: "no_contact" }, { code: "no_name" }],
          outcome: null,
        },
      ],
      nextCursor: 7,
    });
    const next = await inOrg((tx) =>
      importRowsPage(tx, importer, "leads", {
        importId: id,
        plan: "not_added",
        reason: "no_contact",
        after: 7,
        limit: 5,
      }),
    );
    expect(next).toMatchObject({ items: [{ rowNumber: 8 }], nextCursor: null });
    await expect(
      inOrg((tx) => importRowsPage(tx, memberOf(organizationId), "leads", { importId: id, plan: "new", limit: 5 })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gives the next rows to add in row order, skipping rows with an outcome", async () => {
    const { id } = await inOrg((tx) => aBatch(tx, { startedBy: importer.userId, status: "adding" }));
    await inOrg(async (tx) => {
      for (const [rowNumber, rowPlan, outcome] of [
        [5, "new", null],
        [2, "enquiry", "merged"],
        [3, "not_added", null],
        [4, "blocked", null],
        [6, "already_imported", null],
        [7, "returning", null],
      ] as const) {
        await aRow(tx, {
          batchId: id,
          rowNumber,
          plan: rowPlan,
          outcome,
          passwordHash: outcome === null ? "hash" : null,
        });
      }
    });
    expect(await inOrg((tx) => rowsToAdd(tx, id, 3))).toEqual([
      { rowNumber: 4, plan: "blocked" },
      { rowNumber: 5, plan: "new" },
      { rowNumber: 6, plan: "already_imported" },
    ]);
    const fingerprint = new Uint8Array(32).fill(1);
    await inOrg((tx) =>
      recordRowOutcomes(tx, id, [
        { rowNumber: 4, outcome: "left_out" },
        { rowNumber: 5, outcome: "added", leadId: importer.userId, personId: importer.memberId, fingerprint },
      ]),
    );
    expect(await inOrg((tx) => rowsToAdd(tx, id, 10))).toEqual([
      { rowNumber: 6, plan: "already_imported" },
      { rowNumber: 7, plan: "returning" },
    ]);
    expect(await inOrg((tx) => findImport(tx, importer, "leads", id))).toMatchObject({ rowsDone: 2, rowsAdded: 1 });
    const row = await inOrg((tx) => tx.importRow.findFirstOrThrow({ where: { batchId: id, rowNumber: 5 } }));
    expect(row).toMatchObject({ outcome: "added", leadId: importer.userId, passwordHash: null });
    expect([...(row.fingerprint ?? [])]).toEqual([...fingerprint]);
  });
});
