// A sheet that is running and checked, with the helpers the check's and the sheet's controls' tests share: an agency, its
// connector, a worker among its people, the sheet's rows to append to, and what the check made.
import { randomUUID } from "node:crypto";
import type { Database } from "@travel-crm/db";
import { checkLeadSheet } from "../../../src/crm/index.js";
import { fakeIdentity } from "../../imports/support/test-imports.js";
import { aRunningSheet, anAgency, checkDependencies, type TestSheets, memberOf } from "./sheets.js";

export const FIELDS = { timestamp: "enquiry_date", fullname: "name", phonenumber: "phone", emailaddress: "email" };
export const HEADER = ["Timestamp", "Full name", "Phone number", "Email Address"];
export const stamp = (minute: number) => `19/10/2026 14:${String(minute % 60).padStart(2, "0")}:00`;
export const answer = (name: string, phone: string, minute = 1, email = "") => [stamp(minute), name, phone, email];

export async function setup(
  test: TestSheets,
  options: { rows?: string[][]; owner?: boolean; fields?: Record<string, string>; access?: "full" | "read_only" } = {},
) {
  const agency = await anAgency(test);
  const importer = memberOf(agency);
  const asha = randomUUID();
  const identity = fakeIdentity({ access: importer, firstOwner: importer.userId, workers: { asha } });
  const sheet = await aRunningSheet(test, importer, {
    rows: options.rows ?? [HEADER],
    fields: options.fields ?? FIELDS,
    identity,
  });
  const dependencies = (extra: Parameters<typeof checkDependencies>[1] = {}) =>
    checkDependencies(test, {
      identity,
      ...(options.access === undefined ? {} : { access: options.access }),
      ...extra,
    });
  const check = (
    mode: "scheduled" | "sync-now" | "recheck" = "scheduled",
    extra?: Parameters<typeof checkDependencies>[1],
    clock?: () => Date,
  ) => checkLeadSheet(dependencies(extra), { organizationId: agency, sheetId: sheet.sheetId, mode }, clock);
  const append = (row: string[]) => {
    test.google.append(sheet.spreadsheetId, "Form responses 1", row);
  };
  const inOrg = <T>(work: Parameters<Database["forOrg"]>[1]) => test.db.forOrg(agency, work) as Promise<T>;
  const leads = () =>
    test.db.forOrg(agency, (tx) => tx.lead.findMany({ orderBy: { id: "asc" }, include: { person: true } }));
  const state = () =>
    test.db.forOrg(agency, (tx) => tx.sheetConnection.findUniqueOrThrow({ where: { id: sheet.sheetId } }));
  const ledger = () =>
    test.db.forOrg(agency, (tx) =>
      tx.sheetRow.findMany({ where: { connectionId: sheet.sheetId }, orderBy: { rowNumber: "asc" } }),
    );
  return { agency, importer, asha, identity, sheet, dependencies, check, append, inOrg, leads, state, ledger };
}
