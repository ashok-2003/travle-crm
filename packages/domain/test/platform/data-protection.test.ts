// Permanent deletion (spec 5): export, typed confirmation, then the job. A whole organization is purged only once
// cancelled, and leaves only its record in the platform log; a removed person, or one record, is erased in every
// module that keeps something about it.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { withDeleted } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordAudit } from "../../src/audit/index.js";
import { memberAccessOf } from "../identity/test-identity.js";
import { systemActor } from "../../src/kernel/index.js";
import { notify } from "../../src/notifications/index.js";
import {
  cancel,
  eraseSubject,
  ERASE_SUBJECT_QUEUE,
  exportOrganization,
  exportSubject,
  listPlatformLog,
  onboardOrganization,
  purgeOrganization,
  PURGE_ORGANIZATION_QUEUE,
  recordPayment,
  requestErasure,
  requestPurge,
} from "../../src/platform/index.js";
import {
  createTestPlan,
  createTestPlatform,
  onboardingInput,
  support,
  supportUserId,
  type TestPlatform,
} from "./test-platform.js";

const traveller = "0199e7a0-0000-7000-8000-0000000000aa";

describe("permanent deletion", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  /** An onboarded agency with a staff member, a traveller's file and audit entries about the traveller. */
  async function agency() {
    const input = onboardingInput(plan);
    const { organizationId, ownerMemberId } = await onboardOrganization(test.services, support, input);
    const client = test.identity.database.client;
    const ownerUserId = (await client.member.findUniqueOrThrow({ where: { id: ownerMemberId } })).userId;
    const owner = await memberAccessOf(test.identity.identity, ownerUserId, organizationId);
    const staff = await test.identity.identity.staff.create(owner, {
      name: "Ravi",
      email: `ravi-${input.code.toLowerCase()}@example.test`,
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    await test.services.db.forOrg(organizationId, async (tx) => {
      await notify(tx, systemActor(organizationId), {
        recipientUserIds: [staff.userId],
        kind: "share-link.opened",
        title: "Quotation opened",
        body: "Just now",
        channels: [],
      });
      await recordAudit(tx, owner, {
        action: "traveller.updated",
        entityType: "traveller",
        entityId: traveller,
        after: { phone: "+919876543210" },
      });
      const file = await tx.attachment.create({
        data: {
          recordType: "traveller",
          recordId: traveller,
          fileName: "Passport.pdf",
          contentType: "application/pdf",
          sizeBytes: 3,
          status: "ready",
          confirmedAt: new Date(),
        },
      });
      await test.storage.put({
        key: `organizations/${organizationId}/attachments/${file.id}`,
        contentType: "application/pdf",
        body: new Uint8Array([1, 2, 3]),
      });
    });
    return { organizationId, code: input.code, owner, staff };
  }

  it("exports an organization: its tables, people and files with links", async () => {
    const { organizationId } = await agency();
    const exported = await exportOrganization(test.services, support, organizationId);
    expect(exported.tables.organization).toEqual([expect.objectContaining({ id: organizationId })]);
    expect(exported.tables.subscription).toHaveLength(1);
    expect(exported.tables.outbox_event).toBeUndefined();
    expect(exported.people.map((person) => person.name).sort()).toEqual(["Asha Sharma", "Ravi"]);
    expect(exported.files).toEqual([
      expect.objectContaining({ fileName: "Passport.pdf", downloadUrl: expect.any(String) as string }),
    ]);
  });

  it("purges a cancelled organization only with its code typed and a fresh export, then leaves its record alone", async () => {
    const { organizationId, code } = await agency();
    const ask = (confirmation: string) => requestPurge(test.services, support, { organizationId, confirmation });
    await expect(ask("WRONG")).rejects.toMatchObject({ reason: "CONFIRMATION_MISMATCH" });
    await expect(ask(code)).rejects.toMatchObject({ reason: "CANCEL_FIRST" });
    await cancel(test.services, support, { organizationId, reason: "Closing down" });
    await expect(ask(code)).rejects.toMatchObject({ reason: "EXPORT_FIRST" });
    await exportOrganization(test.services, support, organizationId);
    const { jobId } = await ask(code);
    expect(test.queue.sent).toContainEqual(
      expect.objectContaining({
        queue: PURGE_ORGANIZATION_QUEUE,
        data: { organizationId, requestedBy: supportUserId },
        options: { id: jobId },
      }),
    );

    expect(await purgeOrganization(test.services, { organizationId, requestedBy: supportUserId })).toMatchObject({
      people: 2,
      files: 1,
    });
    const client = test.identity.database.client;
    expect(await client.organization.count({ where: { id: organizationId } })).toBe(0);
    expect(await withDeleted(() => client.member.count({ where: { organizationId } }))).toBe(0);
    expect([...test.storage.objects.keys()].some((key) => key.includes(organizationId))).toBe(false);
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 10 }),
    );
    expect(log.entries[0]).toMatchObject({ action: "organization.purged", before: { code } });
    // Again: nothing left, nothing done.
    expect(await purgeOrganization(test.services, { organizationId, requestedBy: supportUserId })).toBeNull();
  });

  it("skips a queued purge when a payment made the organization active again before the job ran", async () => {
    const { organizationId, code } = await agency();
    await cancel(test.services, support, { organizationId, reason: "Closing down" });
    await exportOrganization(test.services, support, organizationId);
    await requestPurge(test.services, support, { organizationId, confirmation: code });
    await recordPayment(test.services, support, {
      organizationId,
      amountPaise: 250_000,
      paidOn: "2026-10-01",
      paidThrough: "2099-12-31",
      reference: "NEFT UTR 412345678901",
    });
    expect(await purgeOrganization(test.services, { organizationId, requestedBy: supportUserId })).toBeNull();
    expect(await test.identity.database.client.organization.count({ where: { id: organizationId } })).toBe(1);
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 10 }),
    );
    expect(log.entries[0]).toMatchObject({ action: "organization.purge-skipped", after: { status: "active" } });
  });

  it("erases a removed member after an export: sign-in data, notifications, and their record's audit snapshots", async () => {
    const { organizationId, code, owner, staff } = await agency();
    const subject = { kind: "member" as const, memberId: staff.memberId };
    await expect(
      requestErasure(test.services, support, { organizationId, subject, confirmation: code }),
    ).rejects.toMatchObject({ reason: "REMOVE_FIRST" });
    await test.identity.identity.staff.remove(owner, { memberId: staff.memberId });
    await expect(
      requestErasure(test.services, support, { organizationId, subject, confirmation: code }),
    ).rejects.toMatchObject({ reason: "EXPORT_FIRST" });
    expect((await exportSubject(test.services, support, { organizationId, subject })).person).toMatchObject({
      name: "Ravi",
    });
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    expect(test.queue.sent.at(-1)).toMatchObject({
      queue: ERASE_SUBJECT_QUEUE,
      data: { kind: "member", memberId: staff.memberId },
    });

    await eraseSubject(test.services, { organizationId, subject, requestedBy: supportUserId });
    const user = await test.identity.database.client.user.findUniqueOrThrow({ where: { id: staff.userId } });
    expect(user.name).toBe("Erased person");
    expect(
      await test.services.db.forOrg(organizationId, (tx) =>
        tx.notification.count({ where: { recipientUserId: staff.userId } }),
      ),
    ).toBe(0);
    const entries = await test.services.db.forOrg(organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { entityId: staff.memberId }, orderBy: { id: "asc" } }),
    );
    expect(entries.at(-1)).toMatchObject({ action: "subject.erased", source: "platform", actorUserId: supportUserId });
    expect(
      entries
        .filter((entry) => entry.after !== null && entry.action !== "subject.erased")
        .every((entry) => JSON.stringify(entry.after) === '{"redacted":true}'),
    ).toBe(true);
  });

  it("erases one record: its files and their bytes, and its audit snapshots", async () => {
    const { organizationId, code } = await agency();
    const subject = { kind: "record" as const, recordType: "traveller", recordId: traveller };
    await exportSubject(test.services, support, { organizationId, subject });
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    await eraseSubject(test.services, { organizationId, subject, requestedBy: supportUserId });
    expect(
      await test.services.db.forOrg(organizationId, (tx) => tx.attachment.count({ where: { recordId: traveller } })),
    ).toBe(0);
    expect([...test.storage.objects.keys()].some((key) => key.includes(organizationId))).toBe(false);
    const entry = await test.services.db.forOrg(organizationId, (tx) =>
      tx.auditEntry.findFirstOrThrow({ where: { entityId: traveller, action: "traveller.updated" } }),
    );
    expect(entry.after).toEqual({ redacted: true });
  });
});
