// Uploading: the browser sends the file straight to storage, the api confirms it arrived as promised, and every
// organization's files count toward its storage limit, deleted ones included until a purge.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { bytes, createOrganization, createTestFiles, memberOf, passportUpload, type TestFiles } from "./test-files.js";

describe("uploading files", () => {
  let test: TestFiles;
  let organizationId: string;

  beforeAll(async () => {
    test = createTestFiles();
    organizationId = await createOrganization(test);
  });

  afterAll(async () => {
    await test.close();
  });

  it("uploads straight to storage under the organization's key, then confirms the file is ready", async () => {
    const sales = memberOf(organizationId, "sales");
    const { attachment, upload } = await test.files.requestUpload(sales, passportUpload());
    expect(attachment).toMatchObject({ status: "pending", fileName: "Passport - Asha.pdf", sensitive: false });
    expect(upload.headers).toEqual({ "content-type": "application/pdf", "content-length": "11" });
    expect(upload.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);

    await test.storage.upload(upload, bytes("%PDF-passpt"), "application/pdf");
    const confirmed = await test.files.confirmUpload(sales, { attachmentId: attachment.id });

    expect(confirmed).toEqual({ ...attachment, status: "ready" });
    expect([...test.storage.objects.keys()]).toContain(`organizations/${organizationId}/attachments/${attachment.id}`);
    expect(await test.files.confirmUpload(sales, { attachmentId: attachment.id })).toEqual(confirmed);
  });

  it("refuses to confirm a file that never arrived, or arrived different", async () => {
    const sales = memberOf(organizationId, "sales");
    const { attachment } = await test.files.requestUpload(sales, passportUpload());
    await expect(test.files.confirmUpload(sales, { attachmentId: attachment.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "UPLOAD_NOT_FOUND",
    });
    await test.storage.put({
      key: `organizations/${organizationId}/attachments/${attachment.id}`,
      contentType: "text/html",
      body: bytes("<script>x()"),
    });
    await expect(test.files.confirmUpload(sales, { attachmentId: attachment.id })).rejects.toMatchObject({
      code: "VALIDATION",
      reason: "UPLOAD_DOES_NOT_MATCH",
    });
    expect(
      await test.files.list(sales, { recordType: "lead", recordId: passportUpload().recordId }),
    ).not.toContainEqual(expect.objectContaining({ id: attachment.id }));
  });

  it("stores a file the server made, ready at once", async () => {
    const stored = await test.files.storeGeneratedFile(systemActor(organizationId), {
      recordType: "issued_document",
      recordId: "0199e7a0-0000-7000-8000-0000000000d1",
      fileName: "DOC-2026-0001.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-1.3 rendered"),
    });
    expect(stored).toMatchObject({ status: "ready", sizeBytes: 17, sensitive: false, recordType: "issued_document" });
    expect(await test.storage.get(`organizations/${organizationId}/attachments/${stored.id}`)).toEqual(
      bytes("%PDF-1.3 rendered"),
    );
    await expect(
      test.files.storeGeneratedFile(systemActor(organizationId), {
        recordType: "issued_document",
        recordId: "0199e7a0-0000-7000-8000-0000000000d1",
        fileName: "empty.pdf",
        contentType: "application/pdf",
        body: new Uint8Array(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "EMPTY_FILE" });
  });
});

describe("the storage limit", () => {
  let test: TestFiles;
  let organizationId: string;

  beforeAll(async () => {
    test = createTestFiles({ storageLimitBytes: 1000 });
    organizationId = await createOrganization(test, "Small plan agency");
  });

  afterAll(async () => {
    await test.close();
  });

  it("refuses an upload that would pass the limit, counting deleted files until they are purged", async () => {
    const owner = memberOf(organizationId, "org-owner");
    const { attachment } = await test.files.requestUpload(owner, passportUpload({ sizeBytes: 600 }));
    await test.files.remove(owner, { attachmentId: attachment.id });

    expect(await test.files.storageUsedBytes(organizationId)).toBe(600);
    await expect(test.files.requestUpload(owner, passportUpload({ sizeBytes: 401 }))).rejects.toMatchObject({
      code: "LIMIT_REACHED",
      reason: "STORAGE_LIMIT_REACHED",
    });
    const { attachment: fits } = await test.files.requestUpload(owner, passportUpload({ sizeBytes: 400 }));
    expect(fits.sizeBytes).toBe(400);
  });
});
