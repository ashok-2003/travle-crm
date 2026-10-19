// Matching an import's columns (spec 3.2 step 2, B8, B10-B13): what each kind needs, one column a field but Note,
// owners and roles the agency has, the importer's value choices and the file's defaults kept, the headers remembered
// for next month's file, and the check started; matching again from the preview empties the last check's rows.
import type { ImportField } from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  cancelImport,
  columnMatchesOf,
  findImport,
  guessFields,
  headerKey,
  importDetail,
  matchImportColumns,
  rememberedFields,
  rememberedHeaderFields,
  rememberHeaderFields,
  type ColumnMatchInput,
} from "../../src/imports/index.js";
import { aBatch, aRow } from "./support/batches.js";
import { anAgency, createTestImports, eventsOf, memberOf, type TestImports } from "./support/test-imports.js";

const asha = "0199e7a0-0000-7000-8000-00000000a5a1";
const ravi = "0199e7a0-0000-7000-8000-00000000a5a2";
const context = (now = new Date()) => ({
  owners: new Set([asha, ravi]),
  roleKeys: new Set(["sales", "org-admin"]),
  now,
});

describe("matching an import's columns", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);

  /** A batch at matching with these headers as columns 0, 1, …, and an Owner column's values with their counts. */
  async function aMatchingImport(headers: readonly string[], kind: "leads" | "staff" = "leads") {
    return inOrg(async (tx) => {
      const { id } = await aBatch(tx, { startedBy: importer.userId, kind, status: "matching", checkedAt: null });
      await tx.importColumn.createMany({
        data: headers.map((header, position) => ({
          batchId: id,
          position,
          header,
          samples: header === "Owner" ? ["Asha", "Ravi"] : [],
          distinctValues: header === "Owner" ? ["Asha", "Ravi"] : [],
          distinctCounts: header === "Owner" ? [3, 1] : [],
        })),
      });
      await tx.importValueMatch.createMany({
        data: [
          { batchId: id, field: "owner", value: "Asha", target: asha, matchedBy: "name" },
          { batchId: id, field: "owner", value: "Ravi", target: null, matchedBy: "none" },
          { batchId: id, field: "role", value: "Sales", target: "sales", matchedBy: "name" },
        ],
      });
      return id;
    });
  }

  const leadInput = (importId: string, fields: (ImportField | null)[], rest: Partial<ColumnMatchInput> = {}) => ({
    importId,
    columns: fields.map((field, position) => ({ position, field })),
    values: [],
    defaults: { stage: "new" as const, ownerUserId: null, budgetBasis: null },
    ...rest,
  });
  const match = (input: ColumnMatchInput, kind: "leads" | "staff" = "leads", now = new Date()) =>
    inOrg((tx) => matchImportColumns(tx, importer, kind, input, context(now)));

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  it("needs Name and a phone, email or Instagram for leads: IMPORT_NEEDS_NAME_AND_CONTACT", async () => {
    const id = await aMatchingImport(["Name", "Mobile", "Notes"]);
    const refused = { code: "VALIDATION", reason: "IMPORT_NEEDS_NAME_AND_CONTACT" };
    await expect(match(leadInput(id, ["name", null, "note"]))).rejects.toMatchObject(refused);
    await expect(match(leadInput(id, [null, "phone", "note"]))).rejects.toMatchObject(refused);
    await expect(match(leadInput(id, ["name", "instagram", null]))).resolves.toBeUndefined();
  });

  it("needs Name, a username or email, and a role for staff: IMPORT_NEEDS_SIGN_IN_NAME_AND_ROLE", async () => {
    const id = await aMatchingImport(["Name", "Login", "Designation"], "staff");
    const staff = (fields: (ImportField | null)[], roleKey: string | null) => ({
      importId: id,
      columns: fields.map((field, position) => ({ position, field })),
      values: [],
      defaults: { roleKey },
    });
    const refused = { code: "VALIDATION", reason: "IMPORT_NEEDS_SIGN_IN_NAME_AND_ROLE" };
    await expect(match(staff(["name", "username", null], null), "staff")).rejects.toMatchObject(refused);
    await expect(match(staff(["name", null, "role"], null), "staff")).rejects.toMatchObject(refused);
    await expect(match(staff([null, "username", "role"], null), "staff")).rejects.toMatchObject(refused);
    await expect(match(staff(["name", "username", null], "sales"), "staff")).resolves.toBeUndefined();
  });

  it("lets several columns go to Note and one to any other field: FIELD_MATCHED_TWICE", async () => {
    const id = await aMatchingImport(["Name", "Mobile", "WhatsApp", "Remarks", "Requirement"]);
    await expect(match(leadInput(id, ["name", "phone", "phone", "note", "note"]))).rejects.toMatchObject({
      code: "VALIDATION",
      reason: "FIELD_MATCHED_TWICE",
    });
    await expect(match(leadInput(id, ["name", "phone", null, "note", "note"]))).resolves.toBeUndefined();
  });

  it("refuses an owner who can't work leads and a role the agency doesn't have", async () => {
    const id = await aMatchingImport(["Name", "Mobile", "Owner"]);
    const stranger = "0199e7a0-0000-7000-8000-00000000a5a9";
    const notWorker = { code: "VALIDATION", reason: "NOT_A_LEAD_WORKER" };
    await expect(
      match(
        leadInput(id, ["name", "phone", "owner"], { values: [{ field: "owner", value: "Ravi", target: stranger }] }),
      ),
    ).rejects.toMatchObject(notWorker);
    await expect(
      match(
        leadInput(id, ["name", "phone", "owner"], {
          defaults: { stage: "new", ownerUserId: stranger, budgetBasis: null },
        }),
      ),
    ).rejects.toMatchObject(notWorker);
    const staffId = await aMatchingImport(["Name", "Email", "Role"], "staff");
    const staff = {
      importId: staffId,
      columns: [
        { position: 0, field: "name" as const },
        { position: 1, field: "email" as const },
      ],
    };
    await expect(match({ ...staff, values: [], defaults: { roleKey: "pilot" } }, "staff")).rejects.toMatchObject({
      reason: "ROLE_NOT_FOUND",
    });
    await expect(
      match(
        {
          ...staff,
          columns: [...staff.columns, { position: 2, field: "role" }],
          values: [{ field: "role", value: "Sales", target: "pilot" }],
          defaults: { roleKey: null },
        },
        "staff",
      ),
    ).rejects.toMatchObject({ reason: "ROLE_NOT_FOUND" });
  });

  it("remembers the matched headers, so next month's file is matched 'As last time'", async () => {
    const id = await aMatchingImport(["Contact No", "Client", "Ref"]);
    await match(leadInput(id, ["phone", "name", null]));
    const keys = ["Contact No", "Client", "Ref"].map(headerKey);
    const remembered = await inOrg((tx) => rememberedFields(tx, "leads", keys));
    expect(Object.fromEntries(remembered)).toEqual({ contactno: "phone", client: "name", ref: null });
    expect(guessFields("leads", ["Contact No", "Client", "Ref"], remembered)).toEqual([
      { field: "phone", guessedBy: "last-time" },
      { field: "name", guessedBy: "last-time" },
      { field: null, guessedBy: "last-time" },
    ]);
    // Staff imports remember their own.
    expect((await inOrg((tx) => rememberedFields(tx, "staff", keys))).size).toBe(0);
  });

  it("remembers a sheet's header matches by key, the last match winning, and reads a kind's whole memory", async () => {
    const agency = await anAgency(test, "Header memory");
    const inAgency = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(agency, work);
    const now = new Date("2026-10-22T08:00:00Z");
    await inAgency((tx) =>
      rememberHeaderFields(
        tx,
        "leads",
        [
          { headerKey: "timestamp", field: "enquiry_date" },
          { headerKey: "whichplace", field: "destination" },
          { headerKey: "anythingelse", field: null },
        ],
        now,
      ),
    );
    // Two at once, as a sheet's connect and a file's match might: both land, neither fails.
    await Promise.all([
      inAgency((tx) => rememberHeaderFields(tx, "leads", [{ headerKey: "whichplace", field: "note" }], now)),
      inAgency((tx) => rememberHeaderFields(tx, "leads", [{ headerKey: "yourcity", field: "departure_city" }], now)),
    ]);
    expect(Object.fromEntries(await inAgency((tx) => rememberedHeaderFields(tx, "leads")))).toEqual({
      timestamp: "enquiry_date",
      whichplace: "note",
      anythingelse: null,
      yourcity: "departure_city",
    });
    expect((await inAgency((tx) => rememberedHeaderFields(tx, "staff"))).size).toBe(0);
    // A file's guesses read the same memory.
    expect(Object.fromEntries(await inAgency((tx) => rememberedFields(tx, "leads", ["timestamp"])))).toEqual({
      timestamp: "enquiry_date",
    });
  });

  it("saves the importer's value choices and the file's defaults, and starts the check", async () => {
    const id = await aMatchingImport(["Name", "Mobile", "Owner"]);
    const now = new Date("2026-10-20T08:00:00Z");
    await match(
      leadInput(id, ["name", "phone", "owner"], {
        values: [
          { field: "owner", value: "Ravi", target: ravi },
          { field: "owner", value: "Never listed", target: asha },
        ],
        defaults: { stage: "contacted", ownerUserId: asha, budgetBasis: "per_person" },
      }),
      "leads",
      now,
    );
    const detail = await inOrg((tx) => importDetail(tx, importer, "leads", id));
    expect(detail).toMatchObject({
      status: "checking",
      defaults: { stage: "contacted", ownerUserId: asha, budgetBasis: "per_person", roleKey: null },
      keepUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(detail.columns.map((column) => [column.field, column.guessedBy])).toEqual([
      ["name", null],
      ["phone", null],
      ["owner", null],
    ]);
    expect(detail.valueMatches).toEqual(
      expect.arrayContaining([
        { field: "owner", value: "Asha", target: asha, matchedBy: "name" },
        { field: "owner", value: "Ravi", target: ravi, matchedBy: "chosen" },
      ]),
    );
    expect(detail.valueMatches.some((valueMatch) => valueMatch.value === "Never listed")).toBe(false);
    const rows = await inOrg((tx) =>
      tx.importValueMatch.findMany({ where: { batchId: id, field: "owner" }, orderBy: { value: "asc" } }),
    );
    expect(rows.map((row) => [row.value, row.rows])).toEqual([
      ["Asha", 3],
      ["Ravi", 1],
    ]);
    expect(await eventsOf(test, organizationId, ["import.columns-matched"])).toContainEqual([
      "import.columns-matched",
      { importId: id, kind: "leads" },
    ]);
    const matches = await inOrg((tx) => columnMatchesOf(tx, id));
    expect([...matches.fieldOf]).toEqual([
      [0, "name"],
      [1, "phone"],
      [2, "owner"],
    ]);
    expect(matches.positionsOf("owner")).toEqual([2]);
    expect(matches.positionsOf("note")).toEqual([]);
    // Asked again while checking: the check is under way.
    await expect(match(leadInput(id, ["name", "phone", null]))).rejects.toMatchObject({ reason: "IMPORT_NOT_READY" });
  });

  it("matches again from the preview, emptying the last check's rows", async () => {
    const id = await aMatchingImport(["Name", "Mobile"]);
    await inOrg(async (tx) => {
      await tx.importBatch.update({ where: { id }, data: { status: "checked", checkedAt: new Date(), rowsToAdd: 2 } });
      await aRow(tx, { batchId: id, rowNumber: 2 });
      await aRow(tx, { batchId: id, rowNumber: 3, plan: "not_added", reasons: ["no_contact"] });
    });
    await match(leadInput(id, ["name", "phone"]));
    const batch = await inOrg((tx) => findImport(tx, importer, "leads", id));
    expect(batch).toMatchObject({ status: "checking", checkedAt: null, rowsToAdd: 0 });
    expect(await inOrg((tx) => tx.importRow.count({ where: { batchId: id } }))).toBe(0);
  });

  it("takes two presses, or a press and a Cancel, in turn: one matches, the other finds it moved on", async () => {
    const id = await aMatchingImport(["Name", "Mobile"]);
    const input = leadInput(id, ["name", "phone"]);
    const both = await Promise.allSettled([match(input), match(input)]);
    expect(both.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(both.find((result) => result.status === "rejected")).toMatchObject({
      reason: { reason: "IMPORT_NOT_READY" },
    });
    const matched = await eventsOf(test, organizationId, ["import.columns-matched"]);
    expect(matched.filter(([, payload]) => JSON.stringify(payload).includes(id))).toHaveLength(1);

    const cancelled = await aMatchingImport(["Name", "Mobile"]);
    const raced = await Promise.allSettled([
      inOrg((tx) => cancelImport(tx, importer, "leads", cancelled, new Date())),
      match(leadInput(cancelled, ["name", "phone"])),
    ]);
    const batch = await inOrg((tx) => findImport(tx, importer, "leads", cancelled));
    // Whichever came first, a cancelled import never goes on to a check.
    if (raced[1].status === "fulfilled") expect(batch.status).toBe("cancelled");
    else expect(raced[1]).toMatchObject({ reason: { reason: "IMPORT_NOT_READY" } });
    const checks = await eventsOf(test, organizationId, ["import.columns-matched"]);
    const published = checks.some(([, payload]) => JSON.stringify(payload).includes(cancelled));
    expect(published).toBe(raced[1].status === "fulfilled");
  });

  it("stores every field of both kinds' lists", async () => {
    const leadFields: ImportField[] = [
      "name",
      "phone",
      "email",
      "instagram",
      "destination",
      "travel_from",
      "travel_to",
    ];
    leadFields.push("travel_month", "adults", "children_ages", "children_count", "budget", "budget_basis");
    leadFields.push("departure_city", "trip_type", "hotel_category", "food", "room_type", "stage", "owner");
    leadFields.push("enquiry_date", "their_source", "note");
    const id = await aMatchingImport(leadFields.map((field) => field));
    await expect(match(leadInput(id, leadFields))).resolves.toBeUndefined();
    const staffId = await aMatchingImport(["a", "b", "c", "d", "e"], "staff");
    await expect(
      match(
        {
          importId: staffId,
          columns: (["name", "username", "email", "phone", "role"] as const).map((field, position) => ({
            position,
            field,
          })),
          values: [],
          defaults: { roleKey: null },
        },
        "staff",
      ),
    ).resolves.toBeUndefined();
  });
});
