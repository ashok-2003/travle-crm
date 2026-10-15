// Permanent deletion through the console (spec 5): only a super admin exports, purges or erases, and a purge asks for
// the organization's code. An organization's export is the console's job: asked for, written by the console process's
// handler, then downloaded through short-lived links, each download in the platform log.
import type { OrganizationExport, OrganizationExportDownload, PlatformLogPage } from "@travel-crm/contracts/platform";
import { startJobHandlers } from "@travel-crm/domain/jobs";
import { platformJobHandlers } from "@travel-crm/domain/platform";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("permanent deletion through the console", () => {
  const queue = createMemoryJobQueue();
  const runner = createMemoryJobRunner(queue);
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server, { queue });
    // The console process's own jobs, as it registers them.
    await startJobHandlers({ runner, handlers: platformJobHandlers(testConsole.services) });
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("lets only a super admin export, download, purge or erase", async () => {
    const organizationId = agency.organizationId;
    const subject = { kind: "member", memberId: agency.owner.memberId };
    for (const [path, input] of [
      ["dataProtection.exportOrganization", { organizationId }],
      ["dataProtection.downloadExport", { exportId: "0199e7a0-0000-7000-8000-00000000e1e1" }],
      ["dataProtection.requestPurge", { organizationId, confirmation: agency.code }],
      ["dataProtection.exportSubject", { organizationId, subject }],
      ["dataProtection.requestErasure", { organizationId, subject, confirmation: agency.code }],
    ] as const) {
      expect(await refusalOf(await consoleMutate(testConsole, path, input, support.jar)), path).toEqual({
        status: 403,
        reason: "SUPER_ADMIN_ONLY",
      });
    }
    expect(
      await refusalOf(await consoleQuery(testConsole, "dataProtection.exports", support.jar, { organizationId })),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
  });

  it("exports as the console's job, then hands out 15-minute links, each download logged", async () => {
    const organizationId = agency.organizationId;
    const requested = await dataOf<OrganizationExport>(
      await consoleMutate(testConsole, "dataProtection.exportOrganization", { organizationId }, superAdmin.jar),
    );
    expect(requested).toMatchObject({ organizationId, state: "requested", requestedBy: superAdmin.userId });
    const download = () =>
      consoleMutate(testConsole, "dataProtection.downloadExport", { exportId: requested.exportId }, superAdmin.jar);
    expect(await refusalOf(await download())).toEqual({ status: 409, reason: "EXPORT_NOT_READY" });

    // The export job, and the expiry it queues for 7 days later (which finds nothing due yet).
    expect(await runner.runQueued()).toBe(2);
    expect(runner.failed).toEqual([]);
    const [done] = await dataOf<OrganizationExport[]>(
      await consoleQuery(testConsole, "dataProtection.exports", superAdmin.jar, { organizationId }),
    );
    expect(done).toMatchObject({ exportId: requested.exportId, state: "done", parts: 1, people: 1 });

    const links = await dataOf<OrganizationExportDownload>(await download());
    expect(links.parts).toHaveLength(1);
    expect(Date.parse(links.linksExpireAt) - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    const log = await dataOf<PlatformLogPage>(
      await consoleQuery(testConsole, "log.list", superAdmin.jar, { targetOrganizationId: organizationId }),
    );
    expect(log.entries.slice(0, 3).map((entry) => [entry.action, entry.actorUserId])).toEqual([
      ["organization.export-downloaded", superAdmin.userId],
      ["organization.exported", superAdmin.userId],
      ["organization.export-requested", superAdmin.userId],
    ]);
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
