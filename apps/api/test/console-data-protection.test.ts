// Permanent deletion through the console (spec 5): only a super admin exports, purges or erases, and a purge asks for
// the organization's code.
import type { OrganizationExport } from "@travel-crm/contracts/platform";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("permanent deletion through the console", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("lets only a super admin export, purge or erase", async () => {
    const organizationId = agency.organizationId;
    for (const [path, input] of [
      ["dataProtection.exportOrganization", { organizationId }],
      ["dataProtection.requestPurge", { organizationId, confirmation: agency.code }],
      [
        "dataProtection.exportSubject",
        { organizationId, subject: { kind: "member", memberId: agency.owner.memberId } },
      ],
    ] as const) {
      expect(await refusalOf(await consoleMutate(testConsole, path, input, support.jar)), path).toEqual({
        status: 403,
        reason: "SUPER_ADMIN_ONLY",
      });
    }
    const exported = await dataOf<OrganizationExport>(
      await consoleMutate(testConsole, "dataProtection.exportOrganization", { organizationId }, superAdmin.jar),
    );
    expect(exported.organizationId).toBe(organizationId);
  });

  it("asks for the organization's code, and refuses a purge of an organization still subscribed", async () => {
    const organizationId = agency.organizationId;
    expect(
      await refusalOf(
        await consoleMutate(
          testConsole,
          "dataProtection.requestPurge",
          { organizationId, confirmation: "NOPE" },
          superAdmin.jar,
        ),
      ),
    ).toEqual({ status: 400, reason: "CONFIRMATION_MISMATCH" });
    expect(
      await refusalOf(
        await consoleMutate(
          testConsole,
          "dataProtection.requestPurge",
          { organizationId, confirmation: agency.code },
          superAdmin.jar,
        ),
      ),
    ).toEqual({ status: 409, reason: "CANCEL_FIRST" });
  });
});
