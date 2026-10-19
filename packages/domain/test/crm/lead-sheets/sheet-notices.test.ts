// What owners are told (S32): up to five leads for one owner send the usual notices; more than five, one summary that names
// no customer; nobody is told about their own leads.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { checkLeadSheet, ownersToSummarise } from "../../../src/crm/lead-sheets/index.js";
import { fakeIdentity } from "../../imports/support/test-imports.js";
import { freshPhone } from "../support/records.js";
import { aRunningSheet, anAgency, checkDependencies, createTestSheets, memberOf } from "../../sheets/support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

const HEADER = ["Timestamp", "Full name", "Phone number", "Handled by"];
const FIELDS = { timestamp: "enquiry_date", fullname: "name", phonenumber: "phone", handledby: "owner" };

async function checked(rowsFor: { owner: "Asha" | "Boss"; count: number }) {
  const agency = await anAgency(test);
  const importer = memberOf(agency);
  const asha = randomUUID();
  const identity = fakeIdentity({
    access: importer,
    firstOwner: importer.userId,
    workers: { asha, boss: importer.userId },
  });
  const sheet = await aRunningSheet(test, importer, { rows: [HEADER], fields: FIELDS, identity });
  for (let index = 0; index < rowsFor.count; index += 1) {
    test.google.append(sheet.spreadsheetId, "Form responses 1", [
      `19/10/2026 14:${String(index).padStart(2, "0")}:00`,
      `Customer Number${String(index)}`,
      freshPhone(),
      rowsFor.owner,
    ]);
  }
  await checkLeadSheet(checkDependencies(test, { identity }), {
    organizationId: agency,
    sheetId: sheet.sheetId,
    mode: "sync-now",
  });
  const notices = await test.db.forOrg(agency, (tx) => tx.notification.findMany({ orderBy: { id: "asc" } }));
  return { asha, importer, notices };
}

describe("ownersToSummarise", () => {
  it("names the owners with more than five", () => {
    expect(
      [
        ...ownersToSummarise(
          new Map([
            ["a", 5],
            ["b", 6],
            ["c", 1],
            ["d", 40],
          ]),
        ),
      ].sort(),
    ).toEqual(["b", "d"]);
  });
});

describe("the notices of a check", () => {
  it("sends up to 5 leads' usual notices to their owner", async () => {
    const { asha, notices } = await checked({ owner: "Asha", count: 5 });
    expect(notices).toHaveLength(5);
    expect(new Set(notices.map((notice) => notice.kind))).toEqual(new Set(["lead.assigned"]));
    expect(new Set(notices.map((notice) => notice.recipientUserId))).toEqual(new Set([asha]));
  });

  it("sends one 'N new leads from X are now yours' for more, naming no customer", async () => {
    const { asha, notices } = await checked({ owner: "Asha", count: 6 });
    expect(notices).toHaveLength(1);
    const [summary] = notices;
    expect(summary).toMatchObject({
      kind: "lead.sheet-added",
      recipientUserId: asha,
      link: "/leads?source=google_sheet",
    });
    expect(summary?.title).toBe("6 new leads from 'Goa Diwali campaign (Responses)' are now yours");
    expect(`${summary?.title ?? ""} ${summary?.body ?? ""}`).not.toContain("Customer");
  });

  it("tells nobody about their own leads", async () => {
    const own = await checked({ owner: "Boss", count: 7 });
    expect(own.notices).toHaveLength(0);
  });
});
