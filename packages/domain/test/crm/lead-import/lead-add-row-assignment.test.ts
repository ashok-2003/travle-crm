// An import row that names no owner is handed to the agency's assignment (release 4); one that names an owner, or an
// import that chose a default owner, is not. No database: the save path is replaced.
import type { OrgTx } from "@travel-crm/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadLookups } from "../../../src/crm/lead-import/lead-lookups.js";
import type { MemberAccess } from "../../../src/identity/index.js";
import type { ImportBatchRow } from "../../../src/imports/index.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const saveEnquiry = vi.hoisted(() => vi.fn());
vi.mock("../../../src/crm/save-enquiry.js", () => ({ saveEnquiry }));

const { addRow } = await import("../../../src/crm/lead-import/lead-add-row.js");
const { readLeadRow } = await import("../../../src/crm/lead-import/lead-row.js");

const DEFAULT_OWNER = "22222222-2222-4222-8222-222222222222";
const WORKER = "33333333-3333-4333-8333-333333333333";

const reading = (() => {
  const fieldOf = new Map([
    [0, "name"],
    [1, "phone"],
  ] as const);
  const read = readLeadRow(
    { rowNumber: 2, cells: ["Asha Rao", "9876543210"] },
    {
      columns: {
        fieldOf,
        positionsOf: (field) => [...fieldOf].filter(([, matched]) => matched === field).map(([position]) => position),
      },
      headers: ["Name", "Phone"],
      ownerOf: () => null,
      stageOf: () => null,
      defaults: { stage: "new", ownerUserId: DEFAULT_OWNER, budgetBasis: "for_everyone" },
      fileName: "enquiries.xlsx",
      today: parseCalendarDate("2026-10-19"),
      timeZone: "Asia/Kolkata",
    },
  );
  if (read.kind !== "enquiry") throw new Error("The sample row should read as an enquiry");
  return { ...read, rowNumber: 2 };
})();

const decision = {
  batch: { defaultOwnerUserId: null, addBlocked: false, addAlreadyImported: false, addInCrm: true } as ImportBatchRow,
  lookups: { isErased: () => false, isBlocked: () => false } as unknown as LeadLookups,
  earlier: new Map<string, Date>(),
  workers: new Set([WORKER, DEFAULT_OWNER]),
  defaultOwner: DEFAULT_OWNER,
  access: {} as MemberAccess,
  timeZone: "Asia/Kolkata",
  now: new Date("2026-10-22T05:00:00Z"),
};

const add = () => addRow({} as OrgTx, decision, { rowNumber: 2, plan: "new" }, reading);

describe("an import row that names no owner", () => {
  beforeEach(() => {
    saveEnquiry.mockReset();
    saveEnquiry.mockResolvedValue({ outcome: "created", leadId: "lead", personId: "person" });
  });

  it("is handed to the agency's assignment, with the lead workers to choose among", async () => {
    await add();
    expect(saveEnquiry).toHaveBeenCalledOnce();
    const options = saveEnquiry.mock.calls[0]?.[4] as Record<string, unknown>;
    expect(options).toMatchObject({
      from: "import",
      ownerUserId: DEFAULT_OWNER,
      assign: { workers: decision.workers },
    });
  });

  it("is not, when the row names the agency Owner, who is the default too", async () => {
    await addRow({} as OrgTx, decision, { rowNumber: 2, plan: "new" }, { ...reading, ownerNamed: true });
    expect(saveEnquiry.mock.calls[0]?.[4]).not.toHaveProperty("assign");
  });

  it("is, when the row names someone who no longer works leads", async () => {
    await addRow(
      {} as OrgTx,
      { ...decision, workers: new Set([DEFAULT_OWNER]) },
      { rowNumber: 2, plan: "new" },
      { ...reading, ownerNamed: true, ownerUserId: WORKER },
    );
    expect(saveEnquiry.mock.calls[0]?.[4]).toHaveProperty("assign");
  });

  it("is not, when the import chose a default owner", async () => {
    await addRow(
      {} as OrgTx,
      { ...decision, batch: { ...decision.batch, defaultOwnerUserId: WORKER } },
      { rowNumber: 2, plan: "new" },
      reading,
    );
    expect(saveEnquiry.mock.calls[0]?.[4]).not.toHaveProperty("assign");
  });
});
