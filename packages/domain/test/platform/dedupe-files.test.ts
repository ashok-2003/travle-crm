// The one-off clean-up of files stored more than once: files with the same size, type and bytes, whatever their names,
// come to share the oldest one's object (one not on a WhatsApp message first), which keeps the bytes' hash so the same
// file sent again finds it; their own objects are deleted once their links have lapsed, and every one still reads the
// same. A dry run changes nothing; other bytes, short-lived files and other organizations are left alone; a second run
// finds nothing.
import { createHash, randomUUID } from "node:crypto";
import { TRIP_KIT_RECORD_TYPE, WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { bytesStored, createFiles, deleteRecordFiles, IMPORT_FILE_RECORD_TYPE } from "../../src/files/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { dedupeStoredFiles } from "../../src/platform/index.js";
import { deleteDueFiles } from "../../src/platform/file-deletions.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

const NOW = new Date("2026-11-25T10:00:00Z");
const MINUTE_MS = 60 * 1000;

describe("the clean-up of files stored more than once", () => {
  let test: TestPlatform;
  let platform: PlatformClient;
  beforeAll(() => {
    test = createTestPlatform();
    platform = createPlatformClient(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  const keyOf = (organizationId: string, id: string) => `organizations/${organizationId}/attachments/${id}`;

  /** A ready file stored on its own, `minutesAgo` old. */
  async function stored(
    organizationId: string,
    file: { recordType: string; body: string; minutesAgo: number; name?: string; contentType?: string },
  ) {
    const at = new Date(NOW.getTime() - file.minutesAgo * MINUTE_MS);
    const contentType = file.contentType ?? "application/pdf";
    const row = await platform.attachment.create({
      data: {
        organizationId,
        recordType: file.recordType,
        recordId: randomUUID(),
        fileName: file.name ?? "Spiti brochure.pdf",
        contentType,
        sizeBytes: file.body.length,
        status: "ready",
        createdAt: at,
        confirmedAt: at,
      },
    });
    await test.storage.put({
      key: keyOf(organizationId, row.id),
      contentType,
      body: new TextEncoder().encode(file.body),
    });
    return row;
  }

  const storedAsOf = async (id: string) => (await platform.attachment.findUniqueOrThrow({ where: { id } })).storedAsId;
  const used = (organizationId: string) =>
    test.services.platformDb.transaction((tx) => bytesStored(tx, organizationId));

  it("makes identical files share one object, then deletes the others' once their links have lapsed", async () => {
    const organizationId = await createTestOrganization(platform, "Dedupe agency");
    const sentFirst = await stored(organizationId, {
      recordType: WHATSAPP_RECORD_TYPE,
      body: "%PDF-spiti",
      minutesAgo: 90,
    });
    const tripKit = await stored(organizationId, {
      recordType: TRIP_KIT_RECORD_TYPE,
      body: "%PDF-spiti",
      minutesAgo: 60,
    });
    // Sent again from a phone, under another name.
    const sentAgain = await stored(organizationId, {
      recordType: WHATSAPP_RECORD_TYPE,
      body: "%PDF-spiti",
      minutesAgo: 30,
      name: "IMG-20261120-WA0004.pdf",
    });
    // A copy made of one of them since copies share bytes: it comes along, so no copy names a copy.
    const copy = await platform.attachment.create({
      data: {
        organizationId,
        recordType: WHATSAPP_RECORD_TYPE,
        recordId: randomUUID(),
        fileName: "Spiti brochure.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        confirmedAt: NOW,
        storedAsId: sentAgain.id,
      },
    });
    // The same size and type with other bytes, and short-lived files: left alone.
    const otherBytes = await stored(organizationId, {
      recordType: WHATSAPP_RECORD_TYPE,
      body: "%PDF-ladak",
      minutesAgo: 20,
    });
    const imports = [1, 2].map(() => ({
      recordType: IMPORT_FILE_RECORD_TYPE,
      body: "name,phone",
      minutesAgo: 10,
      name: "leads.csv",
      contentType: "text/csv",
    }));
    for (const file of imports) await stored(organizationId, file);
    const elsewhere = await createTestOrganization(platform, "Untouched agency");
    await stored(elsewhere, { recordType: WHATSAPP_RECORD_TYPE, body: "%PDF-spiti", minutesAgo: 5 });
    await stored(elsewhere, { recordType: WHATSAPP_RECORD_TYPE, body: "%PDF-spiti", minutesAgo: 4 });
    const objects = test.storage.objects.size;
    const before = await used(organizationId);

    const counted = await dedupeStoredFiles(test.services, { apply: false, organizationId }, NOW);
    expect(counted).toEqual([{ organizationId, files: 2, bytes: 20 }]);
    expect(await storedAsOf(sentFirst.id)).toBeNull();
    expect(test.storage.objects.size).toBe(objects);
    expect((await platform.attachment.findUniqueOrThrow({ where: { id: tripKit.id } })).contentSha256).toBeNull();

    const applied = await dedupeStoredFiles(test.services, { apply: true, organizationId }, NOW);
    expect(applied).toEqual(counted);
    expect(await platform.attachment.findUniqueOrThrow({ where: { id: tripKit.id } })).toMatchObject({
      storedAsId: null,
      contentSha256: createHash("sha256").update("%PDF-spiti").digest("hex"),
    });
    for (const id of [sentFirst.id, sentAgain.id, copy.id]) expect(await storedAsOf(id)).toBe(tripKit.id);
    expect(await storedAsOf(otherBytes.id)).toBeNull();
    expect(await used(organizationId)).toBe(before - 20);
    expect(await platform.attachment.count({ where: { organizationId: elsewhere, storedAsId: { not: null } } })).toBe(
      0,
    );

    // Not before the links handed out for them lapse; then the outbox deletes the two objects no file reads any more.
    expect(await deleteDueFiles(test.services, { now: new Date(NOW.getTime() + 19 * MINUTE_MS), organizationId })).toBe(
      0,
    );
    expect(await deleteDueFiles(test.services, { now: new Date(NOW.getTime() + 21 * MINUTE_MS), organizationId })).toBe(
      2,
    );
    expect(test.storage.objects.size).toBe(objects - 2);
    expect(test.storage.objects.has(keyOf(organizationId, tripKit.id))).toBe(true);
    expect(test.storage.objects.has(keyOf(organizationId, sentFirst.id))).toBe(false);
    expect(test.storage.objects.has(keyOf(organizationId, sentAgain.id))).toBe(false);
    // Each still reads the same, through the files module (its own key holds nothing now).
    const files = createFiles({ db: test.services.db, storage: test.storage });
    for (const row of [sentFirst, sentAgain, copy, tripKit]) {
      const read = await files.systemFile(organizationId, {
        recordType: row.recordType,
        recordId: row.recordId,
        attachmentId: row.id,
      });
      expect(new TextDecoder().decode(read.body)).toBe("%PDF-spiti");
    }

    expect(await dedupeStoredFiles(test.services, { apply: true, organizationId }, NOW)).toEqual([
      { organizationId, files: 0, bytes: 0 },
    ]);

    // The phone sends it once more: the media job's file finds the holder by its hash and stores nothing.
    const echo = await files.storeGeneratedFile(systemActor(organizationId), {
      recordType: WHATSAPP_RECORD_TYPE,
      recordId: randomUUID(),
      fileName: "IMG-20261125-WA0001.pdf",
      contentType: "application/pdf",
      body: new TextEncoder().encode("%PDF-spiti"),
    });
    expect(await storedAsOf(echo.id)).toBe(tripKit.id);
  });

  it("keeps a file's own object when the holder is erased before the outbox deletes it: the file holds the bytes now", async () => {
    const organizationId = await createTestOrganization(platform, "Erased soon agency");
    const sent = await stored(organizationId, { recordType: WHATSAPP_RECORD_TYPE, body: "%PDF-manal", minutesAgo: 90 });
    const lead = await stored(organizationId, { recordType: "lead", body: "%PDF-manal", minutesAgo: 60 });
    await dedupeStoredFiles(test.services, { apply: true, organizationId }, NOW);
    expect(await storedAsOf(sent.id)).toBe(lead.id);
    const erased = { organizationId, recordType: "lead", recordId: lead.recordId };
    await test.services.platformDb.transaction((tx) => deleteRecordFiles(tx, test.storage, erased, NOW));
    expect(await storedAsOf(sent.id)).toBeNull();
    await deleteDueFiles(test.services, { now: new Date(NOW.getTime() + 21 * MINUTE_MS), organizationId });
    expect(test.storage.objects.has(keyOf(organizationId, lead.id))).toBe(false);
    expect(new TextDecoder().decode((await test.storage.get(keyOf(organizationId, sent.id))) ?? undefined)).toBe(
      "%PDF-manal",
    );
  });

  it("skips the storage delete of a queued file that holds its own bytes again, and only forgets the queue's row", async () => {
    const organizationId = await createTestOrganization(platform, "Holds again agency");
    const lead = await stored(organizationId, { recordType: "lead", body: "%PDF-tosh", minutesAgo: 60 });
    await platform.storedFileDeletion.create({
      data: { targetOrganizationId: organizationId, attachmentId: lead.id, dueAt: NOW },
    });
    expect(await deleteDueFiles(test.services, { now: NOW, organizationId })).toBe(1);
    expect(test.storage.objects.has(keyOf(organizationId, lead.id))).toBe(true);
    expect(await platform.storedFileDeletion.count({ where: { targetOrganizationId: organizationId } })).toBe(0);
  });

  it("never deletes the bytes a hand-over is giving a file at that very moment", async () => {
    const organizationId = await createTestOrganization(platform, "Race agency");
    const sent = await stored(organizationId, { recordType: WHATSAPP_RECORD_TYPE, body: "%PDF-kasol", minutesAgo: 90 });
    const lead = await stored(organizationId, { recordType: "lead", body: "%PDF-kasol", minutesAgo: 60 });
    // The clean-up queued the sent file's own object; the lead is erased while the outbox job runs.
    await dedupeStoredFiles(test.services, { apply: true, organizationId }, NOW);
    const held = Promise.withResolvers<undefined>();
    const handedOver = Promise.withResolvers<undefined>();
    const erased = { organizationId, recordType: "lead", recordId: lead.recordId };
    const erasure = test.services.platformDb.transaction(
      async (tx) => {
        await deleteRecordFiles(tx, test.storage, erased, NOW);
        handedOver.resolve(undefined);
        await held.promise;
      },
      { timeout: 20_000 },
    );
    await handedOver.promise;
    const job = deleteDueFiles(test.services, { now: new Date(NOW.getTime() + 60 * MINUTE_MS), organizationId });
    await new Promise((resolve) => setTimeout(resolve, 300));
    held.resolve(undefined);
    await erasure;
    await job;
    expect(await storedAsOf(sent.id)).toBeNull();
    expect(new TextDecoder().decode((await test.storage.get(keyOf(organizationId, sent.id))) ?? undefined)).toBe(
      "%PDF-kasol",
    );
  });
});
