// The lead import's listeners, until the lead import branch builds them (bulk plan, Tasks 1.3 and 1.4): they share
// their events with the staff import's, leave a staff import alone, take their first step on a lead one (the file
// read, the importer's access afresh), and refuse it.
import type { DomainEvent } from "../../../src/jobs/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLeadImportListener, checkLeadImportListener } from "../../../src/crm/index.js";
import type { MemberAccess } from "../../../src/identity/index.js";
import {
  anAgency,
  anImportWithFile,
  createTestImports,
  fakeIdentity,
  jobDependencies,
  listenerContext,
  memberOf,
  type TestImports,
} from "../../imports/support/test-imports.js";

describe("the lead import's listeners", () => {
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

  it("leave another kind's import to its own listeners, until the lead import is built", async () => {
    const dependencies = jobDependencies(test, fakeIdentity({ access: importer }));
    const check = checkLeadImportListener(dependencies);
    const add = addLeadImportListener(dependencies);
    expect([check.name, check.eventType, add.name, add.eventType]).toEqual([
      "crm.check-lead-import",
      "import.columns-matched",
      "crm.add-lead-import",
      "import.add-requested",
    ]);
    const file = test.spreadsheets.bytesOf({ header: ["Name"], rows: [["Asha"]] });
    const staff = await anImportWithFile(test, importer, file, { kind: "staff", status: "checking" });
    await expect(
      check.handle(step("import.columns-matched", staff.id, "staff"), listenerContext(test, organizationId)),
    ).resolves.toBeUndefined();
    const checking = await anImportWithFile(test, importer, file, { status: "checked" });
    const adding = await anImportWithFile(test, importer, file, { status: "adding" });
    await expect(
      add.handle(step("import.add-requested", adding.id, "leads"), listenerContext(test, organizationId)),
    ).rejects.toThrow("Not built yet: bulk plan, Task 1.4");
    // An import no longer at the step is left alone.
    await expect(
      add.handle(step("import.add-requested", checking.id, "leads"), listenerContext(test, organizationId)),
    ).resolves.toBeUndefined();
  });
});
