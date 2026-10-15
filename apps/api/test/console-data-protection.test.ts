// Permanent deletion through the console (spec 5): only a super admin exports, purges or erases, and a purge asks for
// the organization's code. An organization's export is the console's job: asked for, written by the console process's
// handler, then downloaded through short-lived links, each download in the platform log; on real S3 storage, its own
// copy of each file downloads after the organization's purge.
import type { OrganizationExport, OrganizationExportDownload, PlatformLogPage } from "@travel-crm/contracts/platform";
import { startJobHandlers } from "@travel-crm/domain/jobs";
import { platformJobHandlers } from "@travel-crm/domain/platform";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { createS3Storage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { startMinio } from "./support/minio.js";
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

  it("keeps the export's own copy of each file, which still downloads after the organization's purge (S3)", async () => {
    const minio = await startMinio("exports");
    const storage = createS3Storage(minio.settings);
    const s3Queue = createMemoryJobQueue();
    const s3Runner = createMemoryJobRunner(s3Queue);
    const s3Console = createTestConsole(server, { storage, queue: s3Queue });
    try {
      await startJobHandlers({ runner: s3Runner, handlers: platformJobHandlers(s3Console.services) });
      const leaving = await createTestAgency(server);
      const organizationId = leaving.organizationId;
      const fileKey = await server.db.forOrg(organizationId, async (tx) => {
        const file = await tx.attachment.create({
          data: {
            recordType: "traveller",
            recordId: crypto.randomUUID(),
            fileName: "Passport.pdf",
            contentType: "application/pdf",
            sizeBytes: 9,
            status: "ready",
            confirmedAt: new Date(),
          },
        });
        const key = `organizations/${organizationId}/attachments/${file.id}`;
        await storage.put({ key, contentType: "application/pdf", body: new TextEncoder().encode("%PDF-1.4 ") });
        return key;
      });
      const mutate = (path: string, input: unknown, jar = superAdmin.jar) => consoleMutate(s3Console, path, input, jar);

      const { exportId } = await dataOf<OrganizationExport>(
        await mutate("dataProtection.exportOrganization", { organizationId }),
      );
      expect(await s3Runner.runQueued()).toBe(2);
      await dataOf(await mutate("subscriptions.cancel", { organizationId, reason: "Closed" }, support.jar));
      await dataOf(await mutate("dataProtection.requestPurge", { organizationId, confirmation: leaving.code }));
      expect(await s3Runner.runQueued()).toBe(1);
      expect(s3Runner.failed).toEqual([]);
      expect(await storage.head(fileKey)).toBeNull();

      const links = await dataOf<OrganizationExportDownload>(
        await mutate("dataProtection.downloadExport", { exportId }),
      );
      expect(links.files).toEqual([{ fileId: fileKey.split("/").at(-1), url: expect.any(String) as string }]);
      const downloaded = await fetch(links.files[0]?.url ?? "");
      expect(downloaded.status).toBe(200);
      expect(downloaded.headers.get("content-type")).toBe("application/pdf");
      expect(await downloaded.text()).toBe("%PDF-1.4 ");
    } finally {
      await s3Console.close();
      await minio.stop();
    }
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
