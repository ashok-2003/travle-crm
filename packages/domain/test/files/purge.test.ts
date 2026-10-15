// Permanent deletion of files (spec 5): the platform finds every stored file of an organization, removed ones
// included; deletes one record's files and their bytes for good; lists files with download links for an export; and
// leaves system-owned files (an issued document's PDF) to go only with their record.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { deleteRecordFiles, deleteStoredFiles, exportedFiles, storedFileKeys } from "../../src/files/index.js";
import { OWNER_ROLE_KEY } from "../../src/identity/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { bytes, createOrganization, createTestFiles, memberOf, passportUpload, type TestFiles } from "./test-files.js";

const traveller = "0199e7a0-0000-7000-8000-0000000000d7";

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

  it("finds where every file of the organization is stored, removed ones included", async () => {
    const organizationId = await createOrganization(test);
    const kept = await stored(organizationId, traveller, "Visa.pdf");
    const removed = await stored(organizationId, traveller, "Old visa.pdf");
    await test.files.remove(memberOf(organizationId, OWNER_ROLE_KEY), {
      recordType: "traveller",
      recordId: traveller,
      attachmentId: removed.id,
    });
    const keys = await platformDb.transaction((tx) => storedFileKeys(tx, organizationId));
    expect(keys.sort()).toEqual(
      [kept.id, removed.id].map((id) => `organizations/${organizationId}/attachments/${id}`).sort(),
    );
  });

  it("deletes one record's files and their bytes for good, and nobody else's", async () => {
    const organizationId = await createOrganization(test);
    const visa = await stored(organizationId, traveller, "Visa.pdf");
    const otherTravellers = await stored(organizationId, "0199e7a0-0000-7000-8000-0000000000d8", "Ticket.pdf");
    const record = { organizationId, recordType: "traveller", recordId: traveller };
    const keys = await platformDb.transaction((tx) => deleteRecordFiles(tx, record));
    await deleteStoredFiles(test.storage, keys);
    expect(keys).toEqual([`organizations/${organizationId}/attachments/${visa.id}`]);
    expect(test.storage.objects.has(keys[0] ?? "")).toBe(false);
    const left = await platformDb.transaction((tx) => storedFileKeys(tx, organizationId));
    expect(left).toEqual([`organizations/${organizationId}/attachments/${otherTravellers.id}`]);
    // Again: nothing left to delete, and deleting stored bytes again is fine.
    expect(await platformDb.transaction((tx) => deleteRecordFiles(tx, record))).toEqual([]);
    await deleteStoredFiles(test.storage, keys);
  });

  it("leaves an issued document's PDF to go only with its record, and refuses the runtime role", async () => {
    const organizationId = await createOrganization(test);
    await expect(
      platformDb.transaction((tx) =>
        deleteRecordFiles(tx, { organizationId, recordType: "issued_document", recordId: traveller }),
      ),
    ).rejects.toMatchObject({ reason: "SYSTEM_OWNED_FILE" });
    await stored(organizationId, traveller, "Visa.pdf");
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        deleteRecordFiles(tx, { organizationId, recordType: "traveller", recordId: traveller }),
      ),
    ).rejects.toThrow(/permission denied/);
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
