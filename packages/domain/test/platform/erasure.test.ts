// Erasing one record (spec 5): only a record that holds a person's data, never what the law keeps; its files, share
// links with their opens, and the notifications about it all go; its stored files outlive no storage failure; the job
// checks its export again on the platform transaction; and a repeated run of a finished erasure changes and records
// nothing more. A customer (a "person" record, R38) also takes crm's part: their leads' notes, enquiries, task titles
// and notifications, and what the audit log says of them; nobody else's.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import type { OrgTx } from "@travel-crm/db";
import { asOrganization, createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { recordAudit } from "../../src/audit/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { notify } from "../../src/notifications/index.js";
import { erasureBlocker } from "../../src/platform/deletion-checks.js";
import { deleteDueFiles } from "../../src/platform/file-deletions.js";
import { eraseSubject, ERASE_SUBJECT_QUEUE, exportSubject, requestErasure } from "../../src/platform/index.js";
import { erasureJobOf } from "../../src/platform/erasure.js";
import { createShareLink, findShareLink, recordShareLinkOpen } from "../../src/share-links/index.js";
import {
  deletionAgency,
  exportTraveller,
  flakyServices,
  keysOf,
  storedFile,
  traveller,
  type DeletionAgency,
} from "./test-deletion.js";
import { createTestPlan, createTestPlatform, support, supportUserId, type TestPlatform } from "./test-platform.js";
import { aLead, aPerson, aTask } from "../crm/support/records.js";

const otherTraveller = "0199e7a0-0000-7000-8000-0000000000ab";
const subject = { kind: "record" as const, recordType: "traveller", recordId: traveller };

describe("erasing a record", () => {
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

  /** Asks for the traveller's erasure after its export, and returns the job as the console's runner would read it. */
  async function requested(agency: DeletionAgency) {
    const { organizationId, code } = agency;
    await exportTraveller(test.services, organizationId);
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    const sent = test.queue.sent.at(-1);
    if (sent?.queue !== ERASE_SUBJECT_QUEUE) throw new Error("no erasure job was queued");
    return erasureJobOf(sent.data);
  }

  it("deletes the record's share links with their opens, and the notifications about it, and nobody else's", async () => {
    const agency = await deletionAgency(test, plan);
    const { organizationId, owner } = agency;
    const db = test.services.db;
    const link = await db.forOrg(organizationId, (tx) =>
      createShareLink(tx, owner, { recordType: "traveller", recordId: traveller, label: "Visa papers for Asha Mehta" }),
    );
    const kept = await db.forOrg(organizationId, (tx) =>
      createShareLink(tx, owner, { recordType: "traveller", recordId: otherTraveller, label: "Ravi's tickets" }),
    );
    await recordShareLinkOpen(db, await findShareLink(db, link.token), {
      ipAddress: "203.0.113.7",
      userAgent: "Mobile Safari",
      preview: false,
    });
    await db.forOrg(organizationId, async (tx) => {
      const opened = await tx.outboxEvent.findFirstOrThrow({ where: { type: "share-link.opened" } });
      const about = (input: { sourceEventId?: string; link?: string; title: string }) =>
        notify(tx, systemActor(organizationId), {
          recipientUserIds: [owner.userId],
          kind: "share-link.opened",
          body: "Just now",
          channels: [],
          ...input,
        });
      // What the sharer's listener sends: its title quotes the link's label.
      await about({ sourceEventId: opened.id, title: "Opened: Visa papers for Asha Mehta" });
      await about({ link: `/travellers/${traveller}`, title: "Asha Mehta's visa is due" });
      await about({ link: `/travellers/${otherTraveller}`, title: "Ravi's tickets are ready" });
    });

    await eraseSubject(test.services, await requested(agency));

    const scoped = { organizationId };
    expect(await platform.shareLink.findMany({ where: scoped, select: { id: true } })).toEqual([
      { id: kept.shareLinkId },
    ]);
    expect(await platform.shareLinkOpen.count({ where: scoped })).toBe(0);
    expect((await platform.notification.findMany({ where: scoped })).map((row) => row.title)).toEqual([
      "Ravi's tickets are ready",
    ]);
  });

  it("refuses what the law keeps and records that hold nobody's data, when asked and again in the job", async () => {
    const { organizationId, code } = await deletionAgency(test, plan);
    const ask = (recordType: string) =>
      requestErasure(test.services, support, {
        organizationId,
        subject: { kind: "record", recordType, recordId: traveller },
        confirmation: code,
      });
    await expect(ask("issued_document")).rejects.toMatchObject({ code: "VALIDATION", reason: "KEPT_BY_LAW" });
    await expect(ask("subscription")).rejects.toMatchObject({ code: "VALIDATION", reason: "NOT_PERSONAL_DATA" });
    await expect(ask("role")).rejects.toMatchObject({ reason: "NOT_PERSONAL_DATA" });
    await expect(
      eraseSubject(test.services, {
        organizationId,
        subject: { kind: "record", recordType: "issued_document", recordId: traveller },
        requestedBy: supportUserId,
      }),
    ).rejects.toMatchObject({ reason: "KEPT_BY_LAW" });
  });

  it("leaves nothing stored when storage fails after the commit and the job runs again", async () => {
    const agency = await deletionAgency(test, plan);
    await storedFile(test, agency.organizationId, "Passport.pdf");
    await exportTraveller(test.services, agency.organizationId);
    const job = { organizationId: agency.organizationId, subject, requestedBy: supportUserId };
    const flaky = flakyServices(test);

    // The first run's storage delete is refused after its commit: the erasure itself is done.
    await eraseSubject(flaky.services, job);
    expect(await platform.attachment.count({ where: { organizationId: agency.organizationId } })).toBe(0);
    expect(keysOf(test, agency.organizationId)).toHaveLength(1);
    // Run again, as pg-boss runs a job at least once, with storage back.
    flaky.failing.now = false;
    await eraseSubject(flaky.services, job);

    expect(keysOf(test, agency.organizationId)).toEqual([]);
  });

  it("keeps a storage failure's files queued, logs it, and the console's job deletes them without a rerun", async () => {
    const agency = await deletionAgency(test, plan);
    await storedFile(test, agency.organizationId, "Passport.pdf");
    const { services, failing, logged } = flakyServices(test);
    const now = new Date();

    await eraseSubject(services, await requested(agency), now);
    expect(await platform.attachment.count({ where: { organizationId: agency.organizationId } })).toBe(0);
    expect(keysOf(test, agency.organizationId)).toHaveLength(1);
    expect(await platform.storedFileDeletion.count({ where: { targetOrganizationId: agency.organizationId } })).toBe(1);
    expect(logged).toEqual([
      `platform.delete-stored-files: organization ${agency.organizationId}'s files are left to the job (FileDeletionsFailedError, caused by Error)`,
    ]);

    failing.now = false;
    await deleteDueFiles(services, { now, organizationId: agency.organizationId });
    expect(keysOf(test, agency.organizationId)).toEqual([]);
    expect(await platform.storedFileDeletion.count({ where: { targetOrganizationId: agency.organizationId } })).toBe(0);
  });

  it("records a repeated run of a finished erasure once, in both logs", async () => {
    const agency = await deletionAgency(test, plan);
    const job = await requested(agency);
    await eraseSubject(test.services, job);
    await eraseSubject(test.services, job);
    const where = { action: "subject.erased", entityId: traveller };
    expect(await platform.auditEntry.count({ where: { organizationId: agency.organizationId, ...where } })).toBe(1);
    expect(
      await platform.platformAuditEntry.count({
        where: { action: "subject.erased", targetOrganizationId: agency.organizationId },
      }),
    ).toBe(1);
  });

  it("erases nothing when the export is over a day old by the time the job runs, and says why", async () => {
    const agency = await deletionAgency(test, plan);
    await storedFile(test, agency.organizationId, "Passport.pdf");
    const job = await requested(agency);
    await eraseSubject(test.services, job, new Date(Date.now() + 25 * 60 * 60 * 1000));
    expect(keysOf(test, agency.organizationId)).toHaveLength(1);
    expect(await platform.attachment.count({ where: { organizationId: agency.organizationId } })).toBe(1);
    const entries = await platform.platformAuditEntry.findMany({
      where: { targetOrganizationId: agency.organizationId, action: { startsWith: "subject.eras" } },
      orderBy: { occurredAt: "asc" },
    });
    expect(entries.map((entry) => [entry.action, entry.actorUserId, entry.after])).toEqual([
      ["subject.erasure-requested", supportUserId, null],
      ["subject.erasure-skipped", supportUserId, { reason: "no-recent-export" }],
    ]);
  });

  it("checks again on the platform transaction, whatever ran in an organization's step before", async () => {
    const agency = await deletionAgency(test, plan);
    const record = { recordType: "traveller", recordId: traveller };
    const afterAStep = (now: Date) =>
      test.services.platformDb.transaction(async (tx) => {
        // Earlier work in a step sees only this organization: none of it may carry into the check.
        await asOrganization(tx, agency.organizationId, (orgTx) => orgTx.attachment.count());
        return erasureBlocker(tx, agency.organizationId, record, now);
      });
    expect(await afterAStep(new Date())).toBe("no-recent-export");
    await exportTraveller(test.services, agency.organizationId);
    expect(await afterAStep(new Date())).toBeNull();
    expect(await afterAStep(new Date(Date.now() + 25 * 60 * 60 * 1000))).toBe("no-recent-export");
  });

  it("reads back only a job that names its request", () => {
    const data = { organizationId: traveller, kind: "record", recordType: "traveller", recordId: traveller };
    expect(() => erasureJobOf({ ...data, requestedBy: supportUserId })).toThrow(TypeError);
    expect(() => erasureJobOf({ ...data, requestedBy: supportUserId, requestId: "not-an-id" })).toThrow(TypeError);
    expect(erasureJobOf({ ...data, requestedBy: supportUserId, requestId: otherTraveller })).toMatchObject({
      requestId: otherTraveller,
      subject,
    });
  });
});

describe("erasing a customer", () => {
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

  /** A customer with an open and a won lead, a note, tasks, a file, a notification and an audit entry about them. */
  const aCustomer = (agency: DeletionAgency, name: string) =>
    test.services.db.forOrg(agency.organizationId, async (tx: OrgTx) => {
      const person = await aPerson(tx, { name });
      await recordAudit(tx, agency.owner, {
        action: "person.added",
        entityType: "person",
        entityId: person.id,
        after: { name },
      });
      const lead = await aLead(tx, { personId: person.id, ownerUserId: agency.owner.userId });
      const won = await aLead(tx, { personId: person.id, stage: "won", ownerUserId: agency.owner.userId });
      const note = await tx.leadNote.create({ data: { leadId: lead.id, body: `${name} wants a houseboat` } });
      await tx.leadTimelineEntry.create({
        data: { leadId: lead.id, kind: "note", recordType: "lead_note", recordId: note.id },
      });
      const task = (leadId: string, title: string, doneAt: Date | null = null) =>
        aTask(tx, {
          title,
          record: { recordType: "lead", recordId: leadId },
          assigneeUserId: agency.owner.userId,
          doneAt,
        });
      const tasks = [await task(lead.id, `Call ${name}`), await task(won.id, `Quote for ${name}`, new Date())];
      await tx.attachment.create({
        data: {
          recordType: "lead",
          recordId: lead.id,
          fileName: `${name}.pdf`,
          contentType: "application/pdf",
          sizeBytes: 3,
        },
      });
      await notify(tx, systemActor(agency.organizationId), {
        recipientUserIds: [agency.owner.userId],
        kind: "lead.assigned",
        title: "New lead assigned to you",
        body: `${name} · Kashmir`,
        link: `/leads/${lead.id}`,
        channels: [],
      });
      return { person, leadIds: [lead.id, won.id], tasks };
    });

  /** Exports the customer, asks for their erasure, and runs the console's job. */
  async function erase(agency: DeletionAgency, personId: string): Promise<void> {
    const subject = { kind: "record" as const, recordType: "person", recordId: personId };
    const { organizationId, code } = agency;
    await exportSubject(test.services, support, { organizationId, subject });
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    const sent = test.queue.sent.at(-1);
    if (sent?.queue !== ERASE_SUBJECT_QUEUE) throw new Error("no erasure job was queued");
    await eraseSubject(test.services, erasureJobOf(sent.data));
  }

  /** What the agency keeps about one customer's leads, read as the platform. */
  const keptAbout = (organizationId: string, leadIds: string[]) =>
    Promise.all([
      platform.leadNote.count({ where: { organizationId, leadId: { in: leadIds } } }),
      platform.leadTimelineEntry.count({ where: { organizationId, leadId: { in: leadIds }, kind: "note" } }),
      platform.task.findMany({
        where: { organizationId, recordId: { in: leadIds } },
        select: { title: true, cancelledAt: true, doneAt: true },
        orderBy: { id: "asc" },
      }),
      platform.notification.count({ where: { organizationId, link: { contains: leadIds[0] ?? "" } } }),
      platform.attachment.count({ where: { organizationId, recordId: { in: leadIds } } }),
    ]);

  it("deletes their leads' notes and repeat enquiries with those timeline entries, and empties their task titles", async () => {
    const agency = await deletionAgency(test, plan);
    const customer = await aCustomer(agency, "Priya Nair");

    await erase(agency, customer.person.id);

    const [notes, noteEntries, tasks, notifications, files] = await keptAbout(agency.organizationId, customer.leadIds);
    expect([notes, noteEntries, notifications, files]).toEqual([0, 0, 0, 0]);
    // A task on an erased lead would sit in Today forever: the open one is cancelled, the done one stays done.
    expect(tasks.map((task) => [task.title, task.cancelledAt !== null, task.doneAt !== null])).toEqual([
      ["", true, false],
      ["", false, true],
    ]);
    const entry = await platform.platformAuditEntry.findFirstOrThrow({
      where: { action: "subject.erased", targetOrganizationId: agency.organizationId },
    });
    expect(entry).toMatchObject({ targetType: "person", targetId: customer.person.id });
    expect(entry.after).toMatchObject({
      customer: {
        leads: 2,
        notes: 1,
        enquiries: 0,
        timelineEntries: 1,
        blockedContacts: 0,
        tasksCancelled: 1,
        taskTitles: 2,
        notifications: 1,
        files: 1,
      },
    });
  });

  it("forgets notifications linking to their leads, and redacts their person audit entries", async () => {
    const agency = await deletionAgency(test, plan);
    const customer = await aCustomer(agency, "Kabir Rao");

    await erase(agency, customer.person.id);

    const where = { organizationId: agency.organizationId };
    expect(await platform.notification.count({ where: { ...where, body: { contains: "Kabir" } } })).toBe(0);
    const audit = await platform.auditEntry.findMany({
      where: { ...where, entityId: customer.person.id },
      orderBy: { id: "asc" },
    });
    expect(audit.map((entry) => [entry.action, entry.after])).toEqual([
      ["person.added", { redacted: true }],
      ["subject.erased", null],
    ]);
  });

  it("leaves another person's leads, notes and tasks untouched", async () => {
    const agency = await deletionAgency(test, plan);
    const customer = await aCustomer(agency, "Ravi Kumar");
    const other = await aCustomer(agency, "Asha Mehta");
    const before = await keptAbout(agency.organizationId, other.leadIds);

    await erase(agency, customer.person.id);

    expect(await keptAbout(agency.organizationId, other.leadIds)).toEqual(before);
    expect(before[2].map((task) => task.title)).toEqual(["Call Asha Mehta", "Quote for Asha Mehta"]);
    expect(await platform.person.findUniqueOrThrow({ where: { id: other.person.id } })).toMatchObject({
      name: "Asha Mehta",
      deletedAt: null,
    });
  });

  it("exports a customer's contacts and leads with what the audit log says of them", async () => {
    const agency = await deletionAgency(test, plan);
    const customer = await aCustomer(agency, "Neha Joshi");
    const { organizationId } = agency;

    const exported = await exportSubject(test.services, support, {
      organizationId,
      subject: { kind: "record", recordType: "person", recordId: customer.person.id },
    });

    expect(exported.customer).toMatchObject({ personId: customer.person.id, name: "Neha Joshi" });
    expect(exported.customer?.leads.map((lead) => lead.notes.length)).toEqual([1, 0]);
    expect(exported.auditEntries.map((entry) => entry.action)).toEqual(["person.added"]);
    // The erasure deletes the files on their leads, so the export holds them.
    expect(exported.files.map((file) => [file.recordType, file.recordId, file.fileName])).toEqual([
      ["lead", customer.leadIds[0], "Neha Joshi.pdf"],
    ]);
    const traveller = await exportSubject(test.services, support, {
      organizationId,
      subject: { kind: "record", recordType: "traveller", recordId: customer.person.id },
    });
    expect(traveller.customer).toBeNull();
    const logged = await platform.platformAuditEntry.findFirstOrThrow({
      where: { action: "subject.exported", targetOrganizationId: organizationId, targetType: "person" },
    });
    expect(logged.after).toEqual({ auditEntries: 1, files: 1, leads: 2 });
  });

  it("erases a customer only after an export of them, not of another record type with their id", async () => {
    const agency = await deletionAgency(test, plan);
    const customer = await aCustomer(agency, "Ishaan Das");
    const { organizationId, code } = agency;
    const recordId = customer.person.id;
    const person = { kind: "record" as const, recordType: "person", recordId };
    await exportSubject(test.services, support, {
      organizationId,
      subject: { kind: "record", recordType: "traveller", recordId },
    });

    await expect(
      requestErasure(test.services, support, { organizationId, subject: person, confirmation: code }),
    ).rejects.toMatchObject({ reason: "EXPORT_FIRST" });
    await eraseSubject(test.services, { organizationId, subject: person, requestedBy: supportUserId });

    expect(await platform.person.findUniqueOrThrow({ where: { id: recordId } })).toMatchObject({
      name: "Ishaan Das",
      erasedAt: null,
    });
    const skipped = await platform.platformAuditEntry.findFirstOrThrow({
      where: { action: "subject.erasure-skipped", targetOrganizationId: organizationId },
    });
    expect(skipped).toMatchObject({ targetType: "person", after: { reason: "no-recent-export" } });
  });
});

describe("erasing someone an import or an export holds", () => {
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

  /** An import whose file and row hold the subject, and an export's file: what the organization keeps in bulk. */
  async function bulkFilesHolding(agency: DeletionAgency, row: { personId?: string; memberId?: string }) {
    return test.services.db.forOrg(agency.organizationId, async (tx: OrgTx) => {
      const file = (recordType: string, recordId: string) =>
        tx.attachment.create({
          data: {
            recordType,
            recordId,
            fileName: "f.csv",
            contentType: "text/csv",
            sizeBytes: 3,
            status: "ready",
            confirmedAt: new Date(),
          },
        });
      const batch = await tx.importBatch.create({
        data: {
          kind: "leads",
          status: "done",
          fileName: "enquiries.csv",
          fileKind: "csv",
          startedBy: agency.owner.userId,
          keepUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { fileAttachmentId: (await file("import_batch", batch.id)).id },
      });
      await tx.importRow.create({
        data: {
          batchId: batch.id,
          rowNumber: 2,
          plan: "new",
          outcome: "added",
          fingerprint: new Uint8Array(32).fill(5),
          ...row,
        },
      });
      const made = await tx.dataExport.create({
        data: { kind: "leads", format: "csv", status: "ready", filter: {}, requestedBy: agency.owner.userId },
      });
      await tx.dataExport.update({
        where: { id: made.id },
        data: { fileAttachmentId: (await file("data_export", made.id)).id },
      });
      return { importId: batch.id, exportId: made.id };
    });
  }

  async function erase(agency: DeletionAgency, subject: Parameters<typeof exportSubject>[2]["subject"]) {
    const { organizationId, code } = agency;
    await exportSubject(test.services, support, { organizationId, subject });
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    const sent = test.queue.sent.at(-1);
    if (sent?.queue !== ERASE_SUBJECT_QUEUE) throw new Error("no erasure job was queued");
    await eraseSubject(test.services, erasureJobOf(sent.data));
  }

  it("erases a customer and a removed member with an import and an export holding them", async () => {
    const agency = await deletionAgency(test, plan);
    const customer = await test.services.db.forOrg(agency.organizationId, (tx: OrgTx) =>
      aPerson(tx, { name: "Asha Mehta" }),
    );
    const held = await bulkFilesHolding(agency, { personId: customer.id });
    await erase(agency, { kind: "record", recordType: "person", recordId: customer.id });
    expect(await platform.attachment.count({ where: { recordId: { in: [held.importId, held.exportId] } } })).toBe(0);
    expect(await platform.importRow.findFirstOrThrow({ where: { batchId: held.importId } })).toMatchObject({
      outcome: "added",
      personId: null,
      fingerprint: null,
    });
    expect(await platform.importBatch.findUniqueOrThrow({ where: { id: held.importId } })).toMatchObject({
      status: "expired",
    });
    expect(await platform.dataExport.findUniqueOrThrow({ where: { id: held.exportId } })).toMatchObject({
      status: "expired",
    });
    const logged = await platform.platformAuditEntry.findFirstOrThrow({
      where: { action: "subject.erased", targetOrganizationId: agency.organizationId, targetType: "person" },
    });
    expect(logged.after).toMatchObject({ importsWithdrawn: 1, exportsWithdrawn: 1, bulkFiles: 2 });

    const ravi = await test.identity.identity.staff.create(agency.owner, {
      name: "Ravi Kumar",
      username: "ravi.k",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    const staffImport = await bulkFilesHolding(agency, { memberId: ravi.memberId });
    await test.identity.identity.staff.remove(agency.owner, { memberId: ravi.memberId });
    await erase(agency, { kind: "member", memberId: ravi.memberId });
    expect(await platform.importRow.findFirstOrThrow({ where: { batchId: staffImport.importId } })).toMatchObject({
      memberId: null,
      fingerprint: null,
    });
    expect(
      await platform.attachment.count({ where: { recordId: { in: [staffImport.importId, staffImport.exportId] } } }),
    ).toBe(0);
  });
});
