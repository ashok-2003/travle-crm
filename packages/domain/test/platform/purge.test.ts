// A purge's stored files can never outlive it (ADR 0023): they are queued in the deletions' outbox in the purge's own
// transaction, deleted after it commits, swept again on a rerun and once late uploads have landed, and a storage that
// fails only delays them. The job checks the request's conditions again under the subscription's lock, blanks
// webhook events still in flight, and holds the organization's row, so a row written meanwhile can't stop it.
import { createHmac, randomUUID } from "node:crypto";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { asOrganization, createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { aLead, aPerson } from "../crm/support/records.js";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { recordAudit } from "../../src/audit/index.js";
import { LATE_WRITES_MS } from "../../src/files/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { deleteDueFiles, DELETE_STORED_FILES_QUEUE } from "../../src/platform/file-deletions.js";
import { erasureJobOf } from "../../src/platform/erasure.js";
import {
  cancel,
  eraseSubject,
  listPlatformLog,
  purgeOrganization,
  requestErasure,
  requestPurge,
} from "../../src/platform/index.js";
import { purgeBlocker } from "../../src/platform/purge.js";
import {
  hmacSha256Signature,
  processWebhookEvent,
  receiveWebhook,
  type WebhookProvider,
} from "../../src/webhooks/index.js";
import { backendPid, waitUntilBlockedBy } from "../lock-waits.js";
import { deletionAgency, exportTraveller, flakyServices, keysOf, storedFile, traveller } from "./test-deletion.js";
import { exportOrganizationNow } from "./test-exports.js";
import { createTestPlan, createTestPlatform, support, supportUserId, type TestPlatform } from "./test-platform.js";

const HOUR_MS = 60 * 60 * 1000;
const secret = "purge-provider-secret";

/** A provider whose handler finds the organization in the payload, then fails: the event stays in flight. */
const failingProvider: WebhookProvider = {
  name: "notes",
  keptHeaders: ["x-notes-signature"],
  verify: hmacSha256Signature({ secret, header: "x-notes-signature", encoding: "hex" }),
  identify: ({ rawBody }) => ({ eventId: (JSON.parse(rawBody) as { id: string }).id, eventType: "payment.captured" }),
  process: (event, processing) => {
    processing.isAbout((JSON.parse(event.payload) as { organizationId: string }).organizationId);
    return Promise.reject(new Error("the payment's record is locked"));
  },
};

describe("purging an organization", () => {
  let test: TestPlatform;
  let plan: PlanSummary;
  let platform: PlatformClient;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
    platform = createPlatformClient(inject("dbUrls").platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

  /** A cancelled, exported agency with two of a traveller's files stored, its purge requested. */
  async function readyToPurge() {
    const agency = await deletionAgency(test, plan);
    await storedFile(test, agency.organizationId, "Passport.pdf");
    await storedFile(test, agency.organizationId, "Aadhaar.pdf");
    await cancel(test.services, support, { organizationId: agency.organizationId, reason: "Closing down" });
    await exportOrganizationNow(test.services, agency.organizationId);
    await requestPurge(test.services, support, { organizationId: agency.organizationId, confirmation: agency.code });
    return { ...agency, job: { organizationId: agency.organizationId, requestedBy: supportUserId } };
  }

  const queued = (organizationId: string) =>
    platform.storedFileDeletion.findMany({
      where: { targetOrganizationId: organizationId },
      orderBy: { dueAt: "asc" },
    });

  it("leaves nothing stored when storage fails after the commit and the job runs again", async () => {
    const { organizationId, job } = await readyToPurge();
    const flaky = flakyServices(test);

    // The first run's storage deletes are refused after its commit: the purge itself is done, and says so.
    expect(await purgeOrganization(flaky.services, job)).toMatchObject({ files: 2 });
    expect(await platform.organization.count({ where: { id: organizationId } })).toBe(0);
    expect(await queued(organizationId)).toHaveLength(2);
    expect(keysOf(test, organizationId)).toHaveLength(2);
    // Run again, as pg-boss runs a job at least once, with storage back.
    flaky.failing.now = false;
    expect(await purgeOrganization(flaky.services, job)).toBeNull();

    expect(keysOf(test, organizationId)).toEqual([]);
  });

  it("purges an organization's import and export tables and files with the rest", async () => {
    const agency = await deletionAgency(test, plan);
    const { organizationId } = agency;
    const kept = await test.services.db.forOrg(organizationId, async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          kind: "leads",
          status: "done",
          fileName: "enquiries.csv",
          fileKind: "csv",
          startedBy: agency.owner.userId,
          keepUntil: new Date(Date.now() + HOUR_MS),
        },
      });
      await tx.importColumn.create({ data: { batchId: batch.id, position: 0, header: "Name", samples: ["Asha"] } });
      await tx.importValueMatch.create({
        data: { batchId: batch.id, field: "stage", value: "Booked", matchedBy: "word" },
      });
      await tx.importRow.create({ data: { batchId: batch.id, rowNumber: 2, plan: "new" } });
      await tx.importHeaderMatch.create({ data: { kind: "leads", headerKey: "name", field: "name" } });
      await tx.dataExport.create({
        data: { kind: "leads", format: "csv", filter: {}, requestedBy: agency.owner.userId },
      });
      return batch.id;
    });
    const file = await test.services.db.forOrg(organizationId, (tx) =>
      tx.attachment.create({
        data: {
          recordType: "import_batch",
          recordId: kept,
          fileName: "enquiries.csv",
          contentType: "text/csv",
          sizeBytes: 1,
        },
      }),
    );
    await test.storage.put({
      key: `organizations/${organizationId}/attachments/${file.id}`,
      contentType: "text/csv",
      body: new Uint8Array([1]),
    });
    await cancel(test.services, support, { organizationId, reason: "Closing down" });
    await exportOrganizationNow(test.services, organizationId);
    await requestPurge(test.services, support, { organizationId, confirmation: agency.code });

    expect(await purgeOrganization(test.services, { organizationId, requestedBy: supportUserId })).toMatchObject({
      files: 1,
    });
    for (const count of [
      platform.importBatch.count({ where: { organizationId } }),
      platform.importColumn.count({ where: { organizationId } }),
      platform.importValueMatch.count({ where: { organizationId } }),
      platform.importRow.count({ where: { organizationId } }),
      platform.importHeaderMatch.count({ where: { organizationId } }),
      platform.dataExport.count({ where: { organizationId } }),
    ]) {
      expect(await count).toBe(0);
    }
    expect(keysOf(test, organizationId)).toEqual([]);
  });

  it("blanks the owner's name, phone and email on the invite that made the organization", async () => {
    const agency = await deletionAgency(test, plan);
    const { organizationId } = agency;
    const invite = await platform.vipInvite.create({
      data: {
        token: randomUUID(),
        companyName: "Sharma Travels",
        ownerName: "Asha Sharma",
        ownerPhone: "+919812345678",
        ownerEmail: "asha@example.com",
        planId: plan.id,
        createdBy: supportUserId,
        joinedOrganizationId: organizationId,
      },
    });
    await cancel(test.services, support, { organizationId, reason: "Closing down" });
    await exportOrganizationNow(test.services, organizationId);
    await requestPurge(test.services, support, { organizationId, confirmation: agency.code });
    await purgeOrganization(test.services, { organizationId, requestedBy: supportUserId });
    expect(await platform.vipInvite.findUniqueOrThrow({ where: { id: invite.id } })).toMatchObject({
      ownerName: "Removed",
      ownerPhone: null,
      ownerEmail: null,
      companyName: "Sharma Travels",
    });
  });

  it("keeps a storage failure's files queued, logs it, and the console's job deletes them without a rerun", async () => {
    const { organizationId, job } = await readyToPurge();
    const { services, failing, logged } = flakyServices(test);
    const now = new Date();

    // The purge is done once its transaction commits: the files wait in the outbox, and the job is queued.
    expect(await purgeOrganization(services, job, { now })).toMatchObject({ files: 2, people: 1 });
    expect(await platform.organization.count({ where: { id: organizationId } })).toBe(0);
    expect(keysOf(test, organizationId)).toHaveLength(2);
    // One line, ids and codes only.
    expect(logged).toMatchObject([
      {
        level: "warn",
        msg: "An organization's files are left to the job",
        queue: DELETE_STORED_FILES_QUEUE,
        organizationId,
        errorName: "FileDeletionsFailedError",
        errorCause: "Error",
      },
    ]);
    expect((await queued(organizationId)).map((row) => row.dueAt)).toEqual([
      now,
      new Date(now.getTime() + LATE_WRITES_MS),
    ]);
    expect(test.queue.sent.filter((sent) => sent.queue === DELETE_STORED_FILES_QUEUE).at(-1)).toMatchObject({
      data: { organizationId },
      options: { retryLimit: 30, startAfter: expect.any(Date) as Date },
    });

    failing.now = false;
    expect(await deleteDueFiles(services, { now, organizationId })).toBeGreaterThanOrEqual(1);
    expect(keysOf(test, organizationId)).toEqual([]);
    // Once late uploads have landed, the folder is swept again and the outbox is empty.
    await deleteDueFiles(services, { now: new Date(now.getTime() + LATE_WRITES_MS), organizationId });
    expect(await queued(organizationId)).toEqual([]);
  });

  it("purges an organization whose website form holds ledger and consent rows", async () => {
    const { organizationId, job } = await readyToPurge();
    await test.services.db.forOrg(organizationId, async (tx) => {
      const form = await tx.websiteForm.create({ data: { keySecret: "abcdefghijklmnop" }, select: { id: true } });
      const person = await aPerson(tx);
      const lead = await aLead(tx, { personId: person.id, source: "web_form" });
      await tx.personConsent.create({
        data: {
          personId: person.id,
          purpose: "marketing",
          action: "granted",
          wording: "Send me offers",
          wordingVersion: 1,
          source: "web_form",
          sourceFormId: form.id,
        },
      });
      await tx.websiteFormSubmission.create({
        data: {
          formId: form.id,
          submissionId: randomUUID(),
          outcome: "new_lead",
          leadId: lead.id,
          personId: person.id,
        },
      });
    });

    expect(await purgeOrganization(test.services, job)).not.toBeNull();

    const where = { organizationId };
    expect(
      await Promise.all([
        platform.websiteFormSubmission.count({ where }),
        platform.personConsent.count({ where }),
        platform.websiteForm.count({ where }),
      ]),
    ).toEqual([0, 0, 0]);
  });

  it("sweeps an organization already purged when its job runs again, and once late uploads land", async () => {
    const { organizationId, job } = await readyToPurge();
    const now = new Date();
    await purgeOrganization(test.services, job, { now });
    expect(keysOf(test, organizationId)).toEqual([]);

    // An upload link handed out before the purge is used after it.
    const late = `organizations/${organizationId}/attachments/${randomUUID()}`;
    await test.storage.put({ key: late, contentType: "application/pdf", body: new Uint8Array([4]) });
    expect(await purgeOrganization(test.services, job, { now })).toBeNull();
    expect(keysOf(test, organizationId)).toEqual([]);

    await test.storage.put({ key: late, contentType: "application/pdf", body: new Uint8Array([5]) });
    await deleteDueFiles(test.services, { now: new Date(now.getTime() + LATE_WRITES_MS), organizationId });
    expect(keysOf(test, organizationId)).toEqual([]);
  });

  it("blanks the webhook events still in flight, counts them, and catches those resolved after the purge", async () => {
    const { organizationId, job } = await readyToPurge();
    const deliver = async () => {
      const body = JSON.stringify({ id: `pay_${randomUUID()}`, organizationId, contact: "+919876543210" });
      const headers = new Headers({ "x-notes-signature": createHmac("sha256", secret).update(body).digest("hex") });
      await receiveWebhook({ db: test.services.db, queue: test.queue, providers: [failingProvider] }, "notes", {
        headers,
        rawBody: body,
      });
      const row = await platform.webhookEvent.findFirstOrThrow({ where: { payload: body } });
      await expect(processWebhookEvent({ db: test.services.db, providers: [failingProvider] }, row.id)).rejects.toThrow(
        /locked/,
      );
      return row.id;
    };
    const inFlight = await deliver();
    const now = new Date();
    await purgeOrganization(test.services, job, { now });

    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 1 }),
    );
    expect(log.entries[0]).toMatchObject({
      action: "organization.purged",
      after: { webhooksTombstoned: 1, webhooksWaiting: 1 },
    });
    const blank = { payload: "", headers: {}, tombstonedAt: expect.any(Date) as Date };
    expect(await platform.webhookEvent.findUniqueOrThrow({ where: { id: inFlight } })).toMatchObject(blank);

    // A retry that only now finds the organization (gone) keeps the payload until the later sweep.
    const later = await deliver();
    await deleteDueFiles(test.services, { now: new Date(now.getTime() + LATE_WRITES_MS), organizationId });
    expect(await platform.webhookEvent.findUniqueOrThrow({ where: { id: later } })).toMatchObject(blank);
  });

  it("keeps an organization whose export is over a day old when the job runs, and says why", async () => {
    const { organizationId, job } = await readyToPurge();
    expect(await purgeOrganization(test.services, job, { now: new Date(Date.now() + 25 * HOUR_MS) })).toBeNull();
    expect(await platform.organization.count({ where: { id: organizationId } })).toBe(1);
    expect(keysOf(test, organizationId)).toHaveLength(2);
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 1 }),
    );
    expect(log.entries[0]).toMatchObject({
      action: "organization.purge-skipped",
      actorUserId: supportUserId,
      after: { reason: "no-recent-export", status: "cancelled" },
    });
  });

  it("checks again on the platform transaction, whatever ran in an organization's step before", async () => {
    const { organizationId } = await deletionAgency(test, plan);
    const afterAStep = (now: Date) =>
      test.services.platformDb.transaction(async (tx) => {
        // Earlier work in a step sees only this organization: none of it may carry into the check.
        await asOrganization(tx, organizationId, (orgTx) => orgTx.subscription.findFirst());
        return (await purgeBlocker(tx, organizationId, now)).blocker;
      });
    expect(await afterAStep(new Date())).toBe("not-cancelled");
    await cancel(test.services, support, { organizationId, reason: "Closing down" });
    expect(await afterAStep(new Date())).toBe("no-recent-export");
    await exportOrganizationNow(test.services, organizationId);
    expect(await afterAStep(new Date())).toBeNull();
    expect(await afterAStep(new Date(Date.now() + 25 * HOUR_MS))).toBe("no-recent-export");
  });

  it("refuses a purge once an erasure has withdrawn the export, when asked and in the job", async () => {
    const { organizationId, code, job } = await readyToPurge();
    // An erasure after the export withdraws every export of the organization: they may hold the erased person.
    await exportTraveller(test.services, organizationId);
    const subject = { kind: "record" as const, recordType: "traveller", recordId: traveller };
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    const erasure = test.queue.sent.at(-1);
    if (!erasure) throw new Error("no erasure job was queued");
    await eraseSubject(test.services, erasureJobOf(erasure.data));

    // The purge asked for before the erasure is kept, and says why, though the export's log entry stays.
    expect(await purgeOrganization(test.services, job)).toBeNull();
    expect(await platform.organization.count({ where: { id: organizationId } })).toBe(1);
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 1 }),
    );
    expect(log.entries[0]).toMatchObject({
      action: "organization.purge-skipped",
      after: { reason: "no-recent-export" },
    });
    // Asked again, it is refused until a new export is made.
    const ask = () => requestPurge(test.services, support, { organizationId, confirmation: code });
    await expect(ask()).rejects.toMatchObject({ reason: "EXPORT_FIRST" });
    await exportOrganizationNow(test.services, organizationId);
    expect(await ask()).toEqual({ jobId: expect.any(String) as string });
  });

  it("counts only this organization's own export", async () => {
    const agency = await deletionAgency(test, plan);
    const other = await deletionAgency(test, plan);
    await cancel(test.services, support, { organizationId: agency.organizationId, reason: "Closing down" });
    // An entry that names this organization as its target but is another organization's export.
    await test.services.platformDb.transaction((tx) =>
      tx.platformAuditEntry.create({
        data: {
          action: "organization.exported",
          targetType: "organization",
          targetId: agency.organizationId,
          targetOrganizationId: other.organizationId,
        },
      }),
    );
    await expect(
      requestPurge(test.services, support, { organizationId: agency.organizationId, confirmation: agency.code }),
    ).rejects.toMatchObject({ reason: "EXPORT_FIRST" });
  });

  it("holds the organization's row: a row written meanwhile waits for the purge, then finds it gone", async () => {
    const { organizationId, job } = await readyToPurge();
    const settled = (promise: Promise<unknown>) =>
      promise.then(
        () => "done",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
    let purge = Promise.resolve("not started");
    let write = Promise.resolve("not started");
    // Another transaction holds the organization's profile, which the purge deletes: the purge, past its checks and
    // holding the organization's row, waits there. A listener then writes an audit entry in the organization.
    await platform.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM organization_profile WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
        const holder = await backendPid(tx);
        purge = settled(purgeOrganization(test.services, job));
        await waitUntilBlockedBy(platform, holder, { statement: "organization_profile" });
        write = settled(
          test.services.db.forOrg(organizationId, (orgTx) =>
            recordAudit(orgTx, systemActor(organizationId), {
              action: "lead.created",
              entityType: "lead",
              entityId: randomUUID(),
            }),
          ),
        );
        // The write is queued behind the purge, which is behind this transaction.
        await waitUntilBlockedBy(platform, holder, { count: 2 });
      },
      { timeout: 30_000 },
    );
    expect(await purge).toBe("done");
    expect(await write).toMatch(/foreign key/i);
    expect(await platform.organization.count({ where: { id: organizationId } })).toBe(0);
    expect(await platform.auditEntry.count({ where: { organizationId } })).toBe(0);
  });

  it("makes a payment recorded during the purge wait, then keeps the organization it made active", async () => {
    const { organizationId, job } = await readyToPurge();
    let purge: Promise<unknown> = Promise.resolve();
    // The payment's transaction holds the subscription, as recordPayment does, while the purge job starts; it marks
    // the organization active and commits only once the purge is waiting for it.
    await platform.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM subscription WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
      purge = purgeOrganization(test.services, job);
      await waitForLockWait(platform);
      await tx.subscription.update({
        where: { organizationId },
        data: { status: "active", statusChangedAt: new Date(), paidThrough: new Date(Date.now() + 400 * 24 * HOUR_MS) },
      });
    });
    await purge;
    expect(await platform.organization.count({ where: { id: organizationId } })).toBe(1);
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 1 }),
    );
    expect(log.entries[0]).toMatchObject({ action: "organization.purge-skipped", after: { status: "active" } });
  });
});

/** Waits until a session is blocked on a lock on the subscription table: the purge, behind the payment. */
async function waitForLockWait(platform: PlatformClient): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [row] = await platform.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND datname = current_database() AND query ILIKE '%subscription%'`;
    if ((row?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the purge never waited for the payment's lock");
}
