// Permanent deletion of files (spec 5): a purge or an erasure queues the files it deletes in the deletions' outbox, in
// its own transaction, by id only; the platform then deletes each queued file or folder from storage and forgets it.
// An export lists files with download links, and system-owned files (an issued document's PDF) go only with their
// record.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  deleteQueuedFile,
  deleteRecordFiles,
  dueFileDeletions,
  exportedFiles,
  forgetFileDeletion,
  LATE_WRITES_MS,
  nextFileDeletionDue,
  organizationFolder,
  queueOrganizationFileDeletion,
} from "../../src/files/index.js";
import { OWNER_ROLE_KEY } from "../../src/identity/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { bytes, createOrganization, createTestFiles, memberOf, passportUpload, type TestFiles } from "./test-files.js";

const traveller = "0199e7a0-0000-7000-8000-0000000000d7";
const otherTraveller = "0199e7a0-0000-7000-8000-0000000000d8";

describe("permanent deletion of files", () => {
  let test: TestFiles;
  let platformDb: PlatformDatabase;

  beforeAll(() => {
    test = createTestFiles();
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 2 });
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  /** Stores a file on the record, the way the system stores generated files. */
  async function stored(organizationId: string, recordId: string, fileName: string) {
    return test.files.storeGeneratedFile(systemActor(organizationId), {
      recordType: "traveller",
      recordId,
      fileName,
      contentType: "application/pdf",
      body: bytes("%PDF-1.3"),
    });
  }

  const queued = (organizationId: string) =>
    test.platform.storedFileDeletion.findMany({
      where: { targetOrganizationId: organizationId },
      orderBy: { dueAt: "asc" },
    });

  it("queues a purge's whole folder, now and once late uploads have landed, counting removed files too", async () => {
    const organizationId = await createOrganization(test);
    await stored(organizationId, traveller, "Visa.pdf");
    const removed = await stored(organizationId, traveller, "Old visa.pdf");
    await test.files.remove(memberOf(organizationId, OWNER_ROLE_KEY), {
      recordType: "traveller",
      recordId: traveller,
      attachmentId: removed.id,
    });
    const now = new Date();
    expect(await platformDb.transaction((tx) => queueOrganizationFileDeletion(tx, organizationId, now))).toBe(2);
    expect(await queued(organizationId)).toEqual([
      expect.objectContaining({ attachmentId: null, dueAt: now }),
      expect.objectContaining({ attachmentId: null, dueAt: new Date(now.getTime() + LATE_WRITES_MS) }),
    ]);
  });

  it("deletes one record's files and queues their bytes in the same transaction, and nobody else's", async () => {
    const organizationId = await createOrganization(test);
    const visa = await stored(organizationId, traveller, "Visa.pdf");
    const ticket = await stored(organizationId, otherTraveller, "Ticket.pdf");
    const record = { organizationId, recordType: "traveller", recordId: traveller };
    expect(await platformDb.transaction((tx) => deleteRecordFiles(tx, record, new Date()))).toBe(1);
    expect(await queued(organizationId)).toEqual([expect.objectContaining({ attachmentId: visa.id })]);
    expect(await test.platform.attachment.count({ where: { organizationId } })).toBe(1);
    // Again: no rows left, so nothing more is queued.
    expect(await platformDb.transaction((tx) => deleteRecordFiles(tx, record, new Date()))).toBe(0);
    expect(await queued(organizationId)).toHaveLength(1);
    // Rolled back with its transaction: nothing deleted, nothing queued.
    await expect(
      platformDb.transaction(async (tx) => {
        await deleteRecordFiles(tx, { ...record, recordId: otherTraveller }, new Date());
        throw new Error("the erasure failed later on");
      }),
    ).rejects.toThrow(/later on/);
    expect(await queued(organizationId)).toHaveLength(1);
    expect(await test.platform.attachment.count({ where: { id: ticket.id } })).toBe(1);
  });

  it("deletes a queued file or folder from storage, then forgets it, and both are safe to repeat", async () => {
    const organizationId = await createOrganization(test);
    const visa = await stored(organizationId, traveller, "Visa.pdf");
    const ticket = await stored(organizationId, otherTraveller, "Ticket.pdf");
    const now = new Date();
    await platformDb.transaction((tx) =>
      deleteRecordFiles(tx, { organizationId, recordType: "traveller", recordId: traveller }, now),
    );
    const [one] = await platformDb.transaction((tx) => dueFileDeletions(tx, { now, limit: 10, organizationId }));
    if (!one) throw new Error("nothing queued");
    await deleteQueuedFile(test.storage, one);
    await deleteQueuedFile(test.storage, one);
    expect(test.storage.objects.has(`organizations/${organizationId}/attachments/${visa.id}`)).toBe(false);
    expect(test.storage.objects.has(`organizations/${organizationId}/attachments/${ticket.id}`)).toBe(true);
    await platformDb.transaction((tx) => forgetFileDeletion(tx, one.id));
    await platformDb.transaction((tx) => forgetFileDeletion(tx, one.id));
    expect(await queued(organizationId)).toEqual([]);

    // A folder: everything in it, whatever row it had or never had.
    await test.storage.put({
      key: `${organizationFolder(organizationId)}stray`,
      contentType: "text/plain",
      body: bytes("x"),
    });
    await platformDb.transaction((tx) => queueOrganizationFileDeletion(tx, organizationId, now));
    const due = await platformDb.transaction((tx) => dueFileDeletions(tx, { now, limit: 10, organizationId }));
    expect(due).toEqual([expect.objectContaining({ attachmentId: null, dueAt: now })]);
    for (const deletion of due) await deleteQueuedFile(test.storage, deletion);
    expect([...test.storage.objects.keys()].filter((key) => key.includes(organizationId))).toEqual([]);
    // The second sweep isn't due yet, and says when it is.
    expect(await platformDb.transaction((tx) => nextFileDeletionDue(tx, organizationId))).toEqual(now);
    for (const deletion of due) await platformDb.transaction((tx) => forgetFileDeletion(tx, deletion.id));
    expect(await platformDb.transaction((tx) => nextFileDeletionDue(tx, organizationId))).toEqual(
      new Date(now.getTime() + LATE_WRITES_MS),
    );
  });

  it("keeps nothing personal in the outbox: ids and times only, never a file's name", async () => {
    const organizationId = await createOrganization(test);
    await stored(organizationId, traveller, "Passport - Asha Mehta.pdf");
    await platformDb.transaction((tx) =>
      deleteRecordFiles(tx, { organizationId, recordType: "traveller", recordId: traveller }, new Date()),
    );
    const columns = await test.platform.$queryRaw<{ column_name: string; data_type: string }[]>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'stored_file_deletion' ORDER BY ordinal_position`;
    expect(columns.map((column) => column.data_type).sort()).toEqual(
      ["timestamp with time zone", "timestamp with time zone", "uuid", "uuid", "uuid"].sort(),
    );
    const rows = await test.platform.$queryRaw<{ row: string }[]>`
      SELECT row_to_json(d)::text AS row FROM stored_file_deletion d
      WHERE target_organization_id = ${organizationId}::uuid`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.row).not.toMatch(/Passport|Asha|\.pdf/);
  });

  it("refuses a system-owned record's files, the runtime role, and a folder that isn't one organization's", async () => {
    const organizationId = await createOrganization(test);
    await expect(
      platformDb.transaction((tx) =>
        deleteRecordFiles(tx, { organizationId, recordType: "issued_document", recordId: traveller }, new Date()),
      ),
    ).rejects.toMatchObject({ reason: "SYSTEM_OWNED_FILE" });
    await stored(organizationId, traveller, "Visa.pdf");
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        deleteRecordFiles(tx, { organizationId, recordType: "traveller", recordId: traveller }, new Date()),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      test.db.forOrg(organizationId, (tx) => dueFileDeletions(tx, { now: new Date(), limit: 1 })),
    ).rejects.toThrow(/permission denied/);
    await expect(
      test.db.forOrg(organizationId, (tx) => queueOrganizationFileDeletion(tx, organizationId, new Date())),
    ).rejects.toThrow(/permission denied/);
    expect(() => organizationFolder("")).toThrow(RangeError);
    expect(() => organizationFolder("x/../y")).toThrow(RangeError);
  });

  it("lists files for an export with download links, marking removed ones and leaving unfinished uploads unlinked", async () => {
    const organizationId = await createOrganization(test);
    const visa = await stored(organizationId, traveller, "Visa.pdf");
    const owner = memberOf(organizationId, OWNER_ROLE_KEY);
    const pending = await test.files.requestUpload(
      owner,
      passportUpload({ recordType: "traveller", recordId: traveller }),
    );
    const listed = await platformDb.transaction((tx) =>
      exportedFiles(tx, test.storage, { organizationId, recordType: "traveller", recordId: traveller }, 3600),
    );
    expect(listed).toEqual([
      expect.objectContaining({
        id: visa.id,
        fileName: "Visa.pdf",
        deleted: false,
        downloadUrl: expect.stringContaining("memory://download/") as string,
      }),
      expect.objectContaining({ id: pending.attachment.id, downloadUrl: null }),
    ]);
  });
});
