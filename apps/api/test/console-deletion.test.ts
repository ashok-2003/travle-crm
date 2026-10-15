// Permanent deletion end to end (spec 5, ADR 0022): a super admin's request through the console's tRPC, the console's
// own jobs (purge or erasure, then the deletions' outbox), to the finished state: nothing left of what went, in the
// database or in storage, and the platform log's record of it. The export a request needs is P's to test; here its
// platform log entry is written straight in.
import { randomUUID } from "node:crypto";
import type { QueuedJob } from "@travel-crm/contracts/platform";
import { recordAudit } from "@travel-crm/domain/audit";
import { systemActor } from "@travel-crm/domain/kernel";
import { notify } from "@travel-crm/domain/notifications";
import { ERASE_SUBJECT_QUEUE } from "@travel-crm/domain/platform";
import { createShareLink, findShareLink, recordShareLinkOpen } from "@travel-crm/domain/share-links";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startConsoleJobs } from "../src/console-jobs.js";
import {
  consoleMutate,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

const DELETE_STORED_FILES_QUEUE = "platform.delete-stored-files";
const LATE_WRITES_MS = 15 * 60 * 1000;

describe("permanent deletion from the console's request to the finished state", () => {
  const storage = createMemoryStorage();
  const consoleQueue = createMemoryJobQueue();
  const consoleRunner = createMemoryJobRunner(consoleQueue);
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer({}, { storage });
    testConsole = createTestConsole(server, { storage, queue: consoleQueue });
    await startConsoleJobs(consoleRunner, testConsole.services, null);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  /** A traveller's passport, stored as the api stores a file. */
  async function passport(agency: TestAgency, traveller: string): Promise<string> {
    const file = await server.files.storeGeneratedFile(systemActor(agency.organizationId), {
      recordType: "traveller",
      recordId: traveller,
      fileName: "Passport - Asha Mehta.pdf",
      contentType: "application/pdf",
      body: new TextEncoder().encode("%PDF-1.3 passport"),
      sensitive: true,
    });
    return file.id;
  }

  const keysOf = (organizationId: string) =>
    [...storage.objects.keys()].filter((key) => key.startsWith(`organizations/${organizationId}/`));

  /** What an export leaves in the platform log, which the request and the job look for. */
  async function exportLogged(organizationId: string, action: string, targetType: string, targetId: string) {
    await server.platform.platformAuditEntry.create({
      data: { actorUserId: superAdmin.userId, action, targetType, targetId, targetOrganizationId: organizationId },
    });
  }

  it("purges a cancelled organization: its rows, people and stored files, and keeps only the platform log's record", async () => {
    const agency = await createTestAgency(server);
    const { organizationId, code } = agency;
    await passport(agency, randomUUID());
    expect(keysOf(organizationId)).toHaveLength(1);
    await dataOf(
      await consoleMutate(testConsole, "subscriptions.cancel", { organizationId, reason: "Closed down" }, support.jar),
    );
    await exportLogged(organizationId, "organization.exported", "organization", organizationId);

    const before = Date.now();
    const { jobId } = await dataOf<QueuedJob>(
      await consoleMutate(
        testConsole,
        "dataProtection.requestPurge",
        { organizationId, confirmation: code },
        superAdmin.jar,
      ),
    );
    // The purge, then the outbox's job, queued for the second sweep once late uploads have landed.
    expect(await consoleRunner.runQueued()).toBe(2);
    expect(consoleRunner.failed).toEqual([]);

    expect(await server.platform.organization.count({ where: { id: organizationId } })).toBe(0);
    expect(await server.platform.member.count({ where: { organizationId } })).toBe(0);
    expect(await server.platform.user.count({ where: { id: agency.owner.userId } })).toBe(0);
    expect(keysOf(organizationId)).toEqual([]);
    const left = await server.platform.storedFileDeletion.findMany({ where: { targetOrganizationId: organizationId } });
    expect(left).toEqual([expect.objectContaining({ attachmentId: null })]);
    expect(left[0]?.dueAt.getTime()).toBeGreaterThanOrEqual(before + LATE_WRITES_MS);
    const followUp = consoleQueue.sent.filter((sent) => sent.queue === DELETE_STORED_FILES_QUEUE).at(-1);
    expect(followUp?.options.startAfter?.getTime()).toBeGreaterThanOrEqual(left[0]?.dueAt.getTime() ?? Infinity);

    const log = await server.platform.platformAuditEntry.findMany({
      where: { targetOrganizationId: organizationId },
      orderBy: { occurredAt: "asc" },
    });
    expect(log.map((entry) => [entry.action, entry.actorUserId])).toEqual([
      ["organization.exported", superAdmin.userId],
      ["organization.purge-requested", superAdmin.userId],
      ["organization.purged", superAdmin.userId],
    ]);
    expect(log.at(-1)?.after).toMatchObject({ files: 1, people: 1 });
    expect(JSON.stringify(log)).not.toMatch(/Passport|Asha/);
    expect(jobId).toEqual(expect.any(String));
  });

  it("erases a traveller in every module: files, share links and opens, notifications, audit snapshots", async () => {
    const agency = await createTestAgency(server);
    const { organizationId, code } = agency;
    const traveller = randomUUID();
    const owner = { organizationId, userId: agency.owner.userId, source: "web" as const, impersonatedBy: null };
    await passport(agency, traveller);
    const link = await server.db.forOrg(organizationId, async (tx) => {
      await recordAudit(tx, owner, {
        action: "traveller.updated",
        entityType: "traveller",
        entityId: traveller,
        after: { phone: "+919876543210" },
      });
      await notify(tx, systemActor(organizationId), {
        recipientUserIds: [agency.owner.userId],
        kind: "traveller.updated",
        title: "Asha Mehta's visa is due",
        body: "In 10 days",
        link: `/travellers/${traveller}`,
        channels: [],
      });
      return createShareLink(tx, owner, { recordType: "traveller", recordId: traveller, label: "Asha Mehta's visa" });
    });
    await recordShareLinkOpen(server.db, await findShareLink(server.db, link.token), {
      ipAddress: "203.0.113.7",
      userAgent: "Mobile Safari",
      preview: false,
    });
    await exportLogged(organizationId, "subject.exported", "traveller", traveller);

    const subject = { kind: "record", recordType: "traveller", recordId: traveller };
    const { jobId } = await dataOf<QueuedJob>(
      await consoleMutate(
        testConsole,
        "dataProtection.requestErasure",
        { organizationId, subject, confirmation: code },
        superAdmin.jar,
      ),
    );
    expect(await consoleRunner.runQueued()).toBe(1);
    expect(consoleRunner.failed).toEqual([]);

    const scoped = { where: { organizationId } };
    expect(await server.platform.attachment.count(scoped)).toBe(0);
    expect(keysOf(organizationId)).toEqual([]);
    expect(await server.platform.storedFileDeletion.count({ where: { targetOrganizationId: organizationId } })).toBe(0);
    expect(await server.platform.shareLink.count(scoped)).toBe(0);
    expect(await server.platform.shareLinkOpen.count(scoped)).toBe(0);
    expect(await server.platform.notification.count(scoped)).toBe(0);
    const audit = await server.platform.auditEntry.findMany({
      where: { organizationId, entityId: traveller },
      orderBy: { id: "asc" },
    });
    expect(audit.map((entry) => [entry.action, entry.after])).toEqual([
      ["traveller.updated", { redacted: true }],
      ["subject.erased", null],
    ]);
    expect(audit.at(-1)).toMatchObject({ source: "platform", actorUserId: superAdmin.userId });
    const erased = await server.platform.platformAuditEntry.findFirstOrThrow({
      where: { action: "subject.erased", targetOrganizationId: organizationId },
    });
    expect(erased).toMatchObject({
      actorUserId: superAdmin.userId,
      targetId: traveller,
      after: { requestId: jobId, files: 1, shareLinks: 1, shareLinkOpens: 1, notifications: 1 },
    });
  });

  it("lets only a super admin ask for an erasure, and only of a record that holds a person's data", async () => {
    const agency = await createTestAgency(server);
    const { organizationId, code } = agency;
    const ask = (recordType: string, jar = superAdmin.jar) =>
      consoleMutate(
        testConsole,
        "dataProtection.requestErasure",
        { organizationId, subject: { kind: "record", recordType, recordId: randomUUID() }, confirmation: code },
        jar,
      );
    expect(await refusalOf(await ask("traveller", support.jar))).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    expect(await refusalOf(await ask("issued_document"))).toEqual({ status: 400, reason: "KEPT_BY_LAW" });
    expect(await refusalOf(await ask("subscription"))).toEqual({ status: 400, reason: "NOT_PERSONAL_DATA" });
  });

  it("fails an erasure job whose data doesn't say what to erase, and erases nothing", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    await startConsoleJobs(runner, testConsole.services, null);
    await queue.send(ERASE_SUBJECT_QUEUE, { organizationId: randomUUID(), kind: "record" }, { retryLimit: 0 });
    expect(await runner.runQueued()).toBe(1);
    expect(runner.failed).toEqual([
      expect.objectContaining({ attempts: 1, error: expect.stringMatching(/TypeError/) as string }),
    ]);
  });
});
