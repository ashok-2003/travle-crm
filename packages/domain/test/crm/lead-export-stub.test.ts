// The lead export's listener, until the lead export branch builds its source (bulk plan, Task 2.1): it shares
// export.requested with the staff export's, leaves a staff export alone, and refuses a lead one.
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeLeadExportListener } from "../../src/crm/index.js";
import { exportDetail, startExport } from "../../src/exports/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { exportDependencies, requested } from "../exports/test-exports.js";
import {
  anAgency,
  createTestImports,
  listenerContext,
  memberOf,
  type TestImports,
} from "../imports/support/test-imports.js";

describe("the lead export's listener", () => {
  let test: TestImports;
  let organizationId: string;
  let requester: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    requester = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  it("leaves another kind's export to its own listener, until the lead export is built", async () => {
    const listener = makeLeadExportListener(exportDependencies(test, requester));
    expect([listener.name, listener.eventType]).toEqual(["crm.make-lead-export", "export.requested"]);
    const staff = await inOrg((tx) => startExport(tx, requester, "staff", { format: "csv", filter: {} }, new Date()));
    await expect(
      listener.handle(requested(organizationId, staff.exportId, "staff"), listenerContext(test, organizationId)),
    ).resolves.toBeUndefined();
    expect(await inOrg((tx) => exportDetail(tx, requester, "staff", staff.exportId))).toMatchObject({
      status: "making",
    });
    const lead = await inOrg((tx) => startExport(tx, requester, "leads", { format: "csv", filter: {} }, new Date()));
    await expect(
      listener.handle(requested(organizationId, lead.exportId), listenerContext(test, organizationId)),
    ).rejects.toThrow("Not built yet: bulk plan, Task 2.1");
  });
});
