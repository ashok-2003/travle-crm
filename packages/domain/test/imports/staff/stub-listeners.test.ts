// The staff import's listeners, until the staff branch builds them (bulk plan, Tasks 3.2 and 3.3): they share their
// events with the lead import's, leave a lead import alone, take their first step on a staff one (the file read, the
// importer's access afresh), and refuse it.
import type { DomainEvent } from "../../../src/jobs/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../../src/identity/index.js";
import { addStaffImportListener, checkStaffImportListener } from "../../../src/imports/index.js";
import {
  anAgency,
  anImportWithFile,
  createTestImports,
  fakeIdentity,
  jobDependencies,
  listenerContext,
  memberOf,
  type TestImports,
} from "../support/test-imports.js";

describe("the staff import's listeners", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;
  const step = (type: string, importId: string, kind: "leads" | "staff"): DomainEvent => ({
    id: crypto.randomUUID(),
    organizationId,
    type,
    payload: { importId, kind },
    occurredAt: new Date(),
  });

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  it("leave another kind's import to its own listeners, until the staff import is built", async () => {
    const dependencies = jobDependencies(test, fakeIdentity({ access: importer }));
    const check = checkStaffImportListener(dependencies);
    const add = addStaffImportListener(dependencies);
    expect([check.name, check.eventType, add.name, add.eventType]).toEqual([
      "imports.check-staff-import",
      "import.columns-matched",
      "imports.add-staff-import",
      "import.add-requested",
    ]);
    const file = test.spreadsheets.bytesOf({ header: ["Name"], rows: [["Ravi"]] });
    const lead = await anImportWithFile(test, importer, file, { status: "checking" });
    await expect(
      check.handle(step("import.columns-matched", lead.id, "leads"), listenerContext(test, organizationId)),
    ).resolves.toBeUndefined();
    const checking = await anImportWithFile(test, importer, file, { kind: "staff", status: "checking" });
    await expect(
      check.handle(step("import.columns-matched", checking.id, "staff"), listenerContext(test, organizationId)),
    ).rejects.toThrow("Not built yet: bulk plan, Task 3.2");
    const adding = await anImportWithFile(test, importer, file, { kind: "staff", status: "adding" });
    await expect(
      add.handle(step("import.add-requested", adding.id, "staff"), listenerContext(test, organizationId)),
    ).rejects.toThrow("Not built yet: bulk plan, Task 3.3");
  });
});
