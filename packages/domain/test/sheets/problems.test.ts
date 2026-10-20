// The rows a sheet couldn't add (S27, S31): listed by row number with their reason, name or value, and first seen, fifty
// to a page; Hide resolves one by hand.
import { afterAll, describe, expect, it } from "vitest";
import { hideProblem, sheetProblems } from "../../src/sheets/index.js";
import { setup as setupSheet } from "./support/running.js";
import { aSheetRow, auditOf, createTestSheets, memberOf } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

async function withProblems(count: number) {
  const running = await setupSheet(test);
  const first = new Date("2026-10-18T10:00:00Z");
  await running.inOrg(async (tx) => {
    for (let index = 0; index < count; index += 1) {
      await aSheetRow(tx, {
        connectionId: running.sheet.sheetId,
        status: "not_added",
        cells: [`problem ${String(index)}`],
        rowNumber: 10 + index,
        reasons: [index % 2 === 0 ? "no_contact" : "blocked"],
        exampleName: index % 3 === 0 ? `Person ${String(index)}` : null,
        exampleValue: index % 3 === 1 ? "98765" : null,
        firstSeenAt: first,
      });
    }
    // Not problems: an added row, a waiting one and a resolved one.
    await aSheetRow(tx, { connectionId: running.sheet.sheetId, status: "added", cells: ["fine"], rowNumber: 5 });
    await aSheetRow(tx, { connectionId: running.sheet.sheetId, status: "pending", cells: ["waiting"], rowNumber: 6 });
    await aSheetRow(tx, {
      connectionId: running.sheet.sheetId,
      status: "not_added",
      cells: ["old"],
      rowNumber: 7,
      resolvedAt: new Date(),
    });
  });
  return running;
}

describe("sheetProblems", () => {
  it("lists the unresolved problems by row number with their reason, name or value, and first seen, 50 a page", async () => {
    const listed = await withProblems(120);
    const sheetId = listed.sheet.sheetId;
    const page1 = await listed.inOrg<Awaited<ReturnType<typeof sheetProblems>>>((tx) => sheetProblems(tx, { sheetId }));
    expect(page1.items).toHaveLength(50);
    expect(page1.items[0]).toMatchObject({
      rowNumber: 10,
      reason: "no_contact",
      name: "Person 0",
      value: null,
      firstSeenAt: "2026-10-18T10:00:00.000Z",
    });
    expect(page1.items[1]).toMatchObject({ rowNumber: 11, reason: "blocked", name: null, value: "98765" });
    expect(page1.nextCursor).toBe(page1.items[49]?.id);
    const page2 = await listed.inOrg<Awaited<ReturnType<typeof sheetProblems>>>((tx) =>
      sheetProblems(tx, { sheetId, after: page1.nextCursor ?? "" }),
    );
    const page3 = await listed.inOrg<Awaited<ReturnType<typeof sheetProblems>>>((tx) =>
      sheetProblems(tx, { sheetId, after: page2.nextCursor ?? "" }),
    );
    expect([page2.items.length, page3.items.length, page3.nextCursor]).toEqual([50, 20, null]);
    const rows = [...page1.items, ...page2.items, ...page3.items].map((item) => item.rowNumber);
    expect(rows).toEqual(Array.from({ length: 120 }, (_, index) => 10 + index));
  });

  it("hides a problem by hand, once, and the line goes", async () => {
    const hiding = await withProblems(3);
    const manager = memberOf(hiding.agency);
    const sheetId = hiding.sheet.sheetId;
    const [first] = (
      await hiding.inOrg<Awaited<ReturnType<typeof sheetProblems>>>((tx) => sheetProblems(tx, { sheetId }))
    ).items;
    if (first === undefined) throw new Error("setup");
    await hiding.inOrg((tx) => hideProblem(tx, manager, { sheetId, rowId: first.id }, new Date()));
    const after = await hiding.inOrg<Awaited<ReturnType<typeof sheetProblems>>>((tx) => sheetProblems(tx, { sheetId }));
    expect(after.items.map((item) => item.rowNumber)).toEqual([11, 12]);
    await expect(
      hiding.inOrg((tx) => hideProblem(tx, manager, { sheetId, rowId: first.id }, new Date())),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const entry = (await auditOf(test, hiding.agency, sheetId)).find((e) => e.action === "sheet.problem-hidden");
    expect(entry?.after).toEqual({ rowNumber: 10 });
  });

  it("keeps a hidden problem hidden while the same row stays as it is, through later checks, and shows it again once it is fixed and broken anew", async () => {
    const running = await setupSheet(test);
    running.append(["19/10/2026 14:00:00", "No Contact Person", "", ""]);
    await running.check("sync-now");
    const [problem] = await running.ledger();
    expect(problem).toMatchObject({ status: "not_added", resolvedAt: null });
    await running.inOrg((tx) =>
      hideProblem(
        tx,
        memberOf(running.agency),
        { sheetId: running.sheet.sheetId, rowId: problem?.id ?? "" },
        new Date(),
      ),
    );
    // Later checks read the row again, still unfixed: it stays hidden.
    await running.check("sync-now");
    await running.check("recheck");
    const [again] = await running.ledger();
    expect(again?.resolvedAt).not.toBeNull();
    const list = await running.inOrg((tx) => sheetProblems(tx, { sheetId: running.sheet.sheetId }));
    expect((list as { items: unknown[] }).items).toHaveLength(0);
  });
});
