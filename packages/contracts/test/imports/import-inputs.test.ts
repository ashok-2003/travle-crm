// The imports' and exports' inputs (spec 6.5): a file is named by its type and size alone, an import or export by its
// id alone, unknown keys are refused, and each kind's fields and value targets are its own. A Google Sheet's import
// (the Sheets sync) adds the in_crm plan and its two reasons, the sheet on the detail and the in-CRM choice, all off by
// default.
import { describe, expect, it } from "vitest";
import { decideLeadImportInput, leadImportFields, matchLeadColumnsInput } from "../../src/crm/index.js";
import { exportIdInput, startStaffExportInput } from "../../src/exports/index.js";
import { matchStaffColumnsInput, staffImportFields } from "../../src/identity/index.js";
import {
  importDetail,
  importField,
  importIdInput,
  importRowsInput,
  importStatuses,
  rowPlans,
  rowReason,
  rowReasonCodes,
  type SheetOrigin,
  startImportInput,
  waitingImportStatuses,
} from "../../src/imports/index.js";

const importId = "0199e7a0-0000-7000-8000-0000000000a1";
const userId = "0199e7a0-0000-7000-8000-0000000000a2";
const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const leadDefaults = { stage: "new", ownerUserId: null, budgetBasis: null };

describe("import and export inputs", () => {
  it("takes an import's file as CSV or .xlsx, at most 10 MB, with a file name storage can keep", () => {
    const file = { fileName: " enquiries-oct-2026.xlsx ", contentType: xlsx, sizeBytes: 10 * 1024 * 1024 };
    expect(startImportInput.parse(file)).toEqual({ ...file, fileName: "enquiries-oct-2026.xlsx" });
    expect(startImportInput.safeParse({ ...file, contentType: "text/csv" }).success).toBe(true);
    for (const contentType of ["application/vnd.ms-excel", "application/pdf", "text/plain"]) {
      expect(startImportInput.safeParse({ ...file, contentType }).success, contentType).toBe(false);
    }
    expect(startImportInput.safeParse({ ...file, sizeBytes: 10 * 1024 * 1024 + 1 }).success).toBe(false);
    expect(startImportInput.safeParse({ ...file, sizeBytes: 0 }).success).toBe(false);
    expect(startImportInput.safeParse({ ...file, fileName: "../leads.csv" }).success).toBe(false);
    expect(startImportInput.safeParse({ ...file, fileName: "x".repeat(201) }).success).toBe(false);
  });

  it("refuses unknown keys in every import and export input", () => {
    const columns = [{ position: 0, field: "name" }];
    const inputs: [{ safeParse(value: unknown): { success: boolean } }, Record<string, unknown>][] = [
      [startImportInput, { fileName: "a.csv", contentType: "text/csv", sizeBytes: 1 }],
      [importIdInput, { importId }],
      [importRowsInput, { importId, plan: "not_added" }],
      [matchLeadColumnsInput, { importId, columns, values: [], defaults: leadDefaults }],
      [decideLeadImportInput, { importId, addBlocked: true, addAlreadyImported: false }],
      [matchStaffColumnsInput, { importId, columns, values: [], defaults: { roleKey: "sales" } }],
      [exportIdInput, { exportId: importId }],
      [startStaffExportInput, { format: "xlsx" }],
    ];
    for (const [schema, valid] of inputs) {
      expect(schema.safeParse(valid).success, JSON.stringify(valid)).toBe(true);
      expect(schema.safeParse({ ...valid, organizationId: userId }).success, JSON.stringify(valid)).toBe(false);
    }
    expect(importRowsInput.parse({ importId, plan: "blocked" }).limit).toBe(5);
    expect(importRowsInput.safeParse({ importId, plan: "blocked", limit: 501 }).success).toBe(false);
  });

  it("lists a lead import's 23 fields and a staff import's 5, and their union of 25", () => {
    expect(leadImportFields).toHaveLength(23);
    expect(staffImportFields).toEqual(["name", "username", "email", "phone", "role"]);
    expect(importField.options).toHaveLength(25);
    expect(new Set(importField.options)).toEqual(new Set([...leadImportFields, ...staffImportFields]));
    // Each kind's own schema takes only its own fields.
    const match = (field: string) => ({
      importId,
      columns: [{ position: 0, field }],
      values: [],
      defaults: leadDefaults,
    });
    expect(matchLeadColumnsInput.safeParse(match("role")).success).toBe(false);
    expect(
      matchStaffColumnsInput.safeParse({
        importId,
        columns: [{ position: 0, field: "budget" }],
        values: [],
        defaults: { roleKey: null },
      }).success,
    ).toBe(false);
    expect(
      matchLeadColumnsInput.safeParse({ ...match("name"), columns: [{ position: 50, field: "name" }] }).success,
    ).toBe(false);
  });

  it("takes an owner value's target as a user id and a stage value's as a stage, and nothing else", () => {
    const withValues = (values: unknown[]) => ({ importId, columns: [], values, defaults: leadDefaults });
    expect(
      matchLeadColumnsInput.safeParse(
        withValues([
          { field: "owner", value: "Asha", target: userId },
          { field: "owner", value: "Someone", target: null },
          { field: "stage", value: "Booked", target: "won" },
          { field: "stage", value: "Junk", target: "not_a_lead" },
        ]),
      ).success,
    ).toBe(true);
    for (const value of [
      { field: "owner", value: "Asha", target: "won" },
      { field: "stage", value: "Booked", target: userId },
      { field: "role", value: "Sales", target: "sales" },
      { field: "stage", value: "", target: "won" },
    ]) {
      expect(matchLeadColumnsInput.safeParse(withValues([value])).success, JSON.stringify(value)).toBe(false);
    }
    // The file's default stage is an open stage, Won or Lost: an import never adds into Not a lead.
    expect(
      matchLeadColumnsInput.safeParse({ ...withValues([]), defaults: { ...leadDefaults, stage: "lost" } }).success,
    ).toBe(true);
    expect(
      matchLeadColumnsInput.safeParse({ ...withValues([]), defaults: { ...leadDefaults, stage: "not_a_lead" } })
        .success,
    ).toBe(false);
    expect(
      matchStaffColumnsInput.safeParse({
        importId,
        columns: [],
        values: [{ field: "role", value: "Sales", target: "Sales!" }],
        defaults: { roleKey: null },
      }).success,
    ).toBe(false);
  });

  it("takes at most the values a file lists: 50 an Owner and 50 a Stage column, 50 a Role column (D6)", () => {
    const owners = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ field: "owner", value: `Owner ${String(index)}`, target: null }));
    const leads = (count: number) => ({ importId, columns: [], values: owners(count), defaults: leadDefaults });
    expect(matchLeadColumnsInput.safeParse(leads(100)).success).toBe(true);
    expect(matchLeadColumnsInput.safeParse(leads(101)).success).toBe(false);
    const roles = (count: number) => ({
      importId,
      columns: [],
      values: Array.from({ length: count }, (_, index) => ({
        field: "role",
        value: `Role ${String(index)}`,
        target: null,
      })),
      defaults: { roleKey: null },
    });
    expect(matchStaffColumnsInput.safeParse(roles(50)).success).toBe(true);
    expect(matchStaffColumnsInput.safeParse(roles(51)).success).toBe(false);
  });

  it("knows the waiting statuses among the twelve, and a reason by its code, field, row and day", () => {
    expect(importStatuses).toHaveLength(12);
    expect(waitingImportStatuses.every((status) => importStatuses.includes(status))).toBe(true);
    expect(rowReason.parse({ code: "same_as_row", row: 12 })).toEqual({ code: "same_as_row", row: 12 });
    expect(rowReason.safeParse({ code: "already_imported", on: "2026-10-12" }).success).toBe(true);
    expect(rowReason.safeParse({ code: "lost_my_way" }).success).toBe(false);
  });

  it("plans a sheet's row in_crm with an open or closed lead, and decides it off unless ticked", () => {
    expect(rowPlans).toEqual(["new", "returning", "enquiry", "blocked", "already_imported", "in_crm", "not_added"]);
    expect(rowReasonCodes).toEqual(expect.arrayContaining(["in_crm_open", "in_crm_closed"]));
    expect(rowReason.parse({ code: "in_crm_closed" })).toEqual({ code: "in_crm_closed" });
    expect(importRowsInput.safeParse({ importId, plan: "in_crm", reason: "in_crm_open" }).success).toBe(true);
    const decided = { importId, addBlocked: false, addAlreadyImported: false };
    expect(decideLeadImportInput.parse(decided)).toEqual({ ...decided, addInCrm: false });
    expect(decideLeadImportInput.parse({ ...decided, addInCrm: true }).addInCrm).toBe(true);
    const origin: SheetOrigin = {
      detail: "Goa Diwali campaign · Form responses 1",
      timeZone: "Asia/Kolkata",
      monthFirstDates: false,
    };
    expect(origin.monthFirstDates).toBe(false);
  });

  it("shows a sheet's import with its sheet and the in-CRM choice, and a file's with neither", () => {
    const sheetId = "0199e7a0-0000-7000-8000-0000000000a3";
    const shape = importDetail.shape;
    expect(shape.sourceSheet.parse(null)).toBeNull();
    expect(shape.sourceSheet.parse({ sheetId })).toEqual({ sheetId });
    expect(shape.choices.parse({ addBlocked: false, addAlreadyImported: true, addInCrm: false })).toEqual({
      addBlocked: false,
      addAlreadyImported: true,
      addInCrm: false,
    });
    expect(shape.choices.safeParse({ addBlocked: false, addAlreadyImported: true }).success).toBe(false);
    expect(shape.counts.unwrap().shape.byPlan.safeParse({ new: 1 }).success).toBe(false);
  });
});
