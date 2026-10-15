// Erasing one record (spec 5): only a record that holds a person's data, never what the law keeps; its files, share
// links with their opens, and the notifications about it all go; its stored files outlive no storage failure; and a
// repeated run of a finished erasure changes and records nothing more.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { notify } from "../../src/notifications/index.js";
import { deleteDueFiles } from "../../src/platform/file-deletions.js";
import { eraseSubject, ERASE_SUBJECT_QUEUE, requestErasure } from "../../src/platform/index.js";
import { erasureJobOf } from "../../src/platform/erasure.js";
import { createShareLink, findShareLink, recordShareLinkOpen } from "../../src/share-links/index.js";
import {
  deletionAgency,
  exportLogged,
  flakyStorage,
  keysOf,
  storedFile,
  traveller,
  type DeletionAgency,
} from "./test-deletion.js";
import { createTestPlan, createTestPlatform, support, supportUserId, type TestPlatform } from "./test-platform.js";

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
    await exportLogged(test, organizationId, "subject.exported", { targetType: "traveller", targetId: traveller });
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
    for (const recordType of ["issued_document", "subscription", "role"]) {
      await exportLogged(test, organizationId, "subject.exported", { targetType: recordType, targetId: traveller });
    }
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
    const job = { organizationId: agency.organizationId, subject, requestedBy: supportUserId };
    const flaky = flakyStorage(test.storage);
    const services = { ...test.services, storage: flaky.storage };

    await eraseSubject(services, job).catch(() => undefined);
    flaky.failing.now = false;
    await eraseSubject(services, job);

    expect(keysOf(test, agency.organizationId)).toEqual([]);
  });

  it("keeps a storage failure's files queued, and the console's job deletes them without a rerun", async () => {
    const agency = await deletionAgency(test, plan);
    await storedFile(test, agency.organizationId, "Passport.pdf");
    const flaky = flakyStorage(test.storage);
    const services = { ...test.services, storage: flaky.storage };
    const now = new Date();

    await eraseSubject(services, await requested(agency), now);
    expect(await platform.attachment.count({ where: { organizationId: agency.organizationId } })).toBe(0);
    expect(keysOf(test, agency.organizationId)).toHaveLength(1);
    expect(await platform.storedFileDeletion.count({ where: { targetOrganizationId: agency.organizationId } })).toBe(1);

    flaky.failing.now = false;
    await deleteDueFiles(services, { now });
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
