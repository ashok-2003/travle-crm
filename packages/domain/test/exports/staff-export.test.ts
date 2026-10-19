// The staff export's listener, until the staff branch builds its source (bulk plan, Task 3.5): it shares
// export.requested with the lead export's, leaves a lead export alone, and refuses a staff one.
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { exportDetail, makeStaffExportListener, startExport } from "../../src/exports/index.js";
import {
  anAgency,
  createTestImports,
  listenerContext,
  memberOf,
  type TestImports,
} from "../imports/support/test-imports.js";
import { exportDependencies, requested } from "./test-exports.js";

describe("the staff export's listener", () => {
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

  it("leaves another kind's export to its own listener, until the staff export is built", async () => {
    const listener = makeStaffExportListener(exportDependencies(test, requester));
    expect([listener.name, listener.eventType]).toEqual(["exports.make-staff-export", "export.requested"]);
    const lead = await inOrg((tx) => startExport(tx, requester, "leads", { format: "xlsx", filter: {} }, new Date()));
    await expect(
      listener.handle(requested(organizationId, lead.exportId), listenerContext(test, organizationId)),
    ).resolves.toBeUndefined();
    expect(await inOrg((tx) => exportDetail(tx, requester, "leads", lead.exportId))).toMatchObject({
      status: "making",
    });
    const staff = await inOrg((tx) => startExport(tx, requester, "staff", { format: "xlsx", filter: {} }, new Date()));
    await expect(
      listener.handle(requested(organizationId, staff.exportId, "staff"), listenerContext(test, organizationId)),
    ).rejects.toThrow("Not built yet: bulk plan, Task 3.5");
  });
});
