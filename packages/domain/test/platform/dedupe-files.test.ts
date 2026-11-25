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
    expect(await deleteDueFiles(test.services, { now: NOW, organizationId })).toBe(0);
    expect(await deleteDueFiles(test.services, { now: new Date(NOW.getTime() + 11 * MINUTE_MS), organizationId })).toBe(
      2,
    );
    expect(test.storage.objects.size).toBe(objects - 2);
    for (const id of [sentFirst.id, sentAgain.id, copy.id, tripKit.id]) {
      const file = await test.services.platformDb.transaction(async (tx) => {
        const row = await tx.attachment.findUniqueOrThrow({ where: { id } });
        return test.storage.get(keyOf(organizationId, row.storedAsId ?? row.id));
      });
      expect(new TextDecoder().decode(file ?? new Uint8Array())).toBe("%PDF-spiti");
    }

    expect(await dedupeStoredFiles(test.services, { apply: true, organizationId }, NOW)).toEqual([
      { organizationId, files: 0, bytes: 0 },
    ]);

    // The phone sends it once more: the media job's file finds the holder by its hash and stores nothing.
    const files = createFiles({ db: test.services.db, storage: test.storage });
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
    await deleteDueFiles(test.services, { now: new Date(NOW.getTime() + 11 * MINUTE_MS), organizationId });
    expect(test.storage.objects.has(keyOf(organizationId, lead.id))).toBe(false);
    expect(new TextDecoder().decode((await test.storage.get(keyOf(organizationId, sent.id))) ?? undefined)).toBe(
      "%PDF-manal",
    );
  });
});
