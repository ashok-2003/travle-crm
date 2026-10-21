// Take over (S34): any manager may take over a sheet that needs one; the rows that waited are added at the next check.
import { afterAll, describe, expect, it } from "vitest";
import { takeOverSheet } from "../../src/sheets/index.js";
import { fakeIdentity } from "../imports/support/test-imports.js";
import { setup as setupSheet } from "./support/running.js";
import { auditOf, createTestSheets, memberOf } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

describe("takeOverSheet", () => {
  it("adds the rows that waited after Take over", async () => {
    const stranded = await setupSheet(test);
    stranded.append(["19/10/2026 14:00:00", "Waiting Person", "+919876500002", ""]);
    const departed = { ...stranded.identity, resolveAccess: () => Promise.resolve(null) };
    await stranded.check("scheduled", { identity: departed });
    expect((await stranded.state()).status).toBe("needs_manager");
    expect(await stranded.leads()).toHaveLength(0);

    const manager = memberOf(stranded.agency);
    await stranded.inOrg((tx) => takeOverSheet(tx, manager, stranded.sheet.sheetId));
    expect(await stranded.state()).toMatchObject({
      status: "running",
      connectedBy: manager.userId,
      attentionSince: null,
    });
    const identity = fakeIdentity({ access: manager, firstOwner: manager.userId });
    await stranded.check("scheduled", { identity });
    expect((await stranded.leads()).map((lead) => lead.person.name)).toEqual(["Waiting Person"]);
  });

  it("makes the caller the connector with one audit entry", async () => {
    const stranded = await setupSheet(test);
    const departed = { ...stranded.identity, resolveAccess: () => Promise.resolve(null) };
    await stranded.check("scheduled", { identity: departed });
    const support = "0199e7a0-0000-7000-8000-0000000000e2";
    const manager = { ...memberOf(stranded.agency), source: "impersonation" as const, impersonatedBy: support };
    await stranded.inOrg((tx) => takeOverSheet(tx, manager, stranded.sheet.sheetId));
    expect(await stranded.state()).toMatchObject({ connectedBy: manager.userId, impersonatedBy: support });
    const entries = await auditOf(test, stranded.agency, stranded.sheet.sheetId);
    expect(entries.filter((entry) => entry.action === "sheet.taken-over")).toHaveLength(1);
  });

  it("refuses a sheet that needs no manager", async () => {
    const fine = await setupSheet(test);
    await expect(
      fine.inOrg((tx) => takeOverSheet(tx, memberOf(fine.agency), fine.sheet.sheetId)),
    ).rejects.toMatchObject({ reason: "SHEET_NOT_READY" });
  });
});
