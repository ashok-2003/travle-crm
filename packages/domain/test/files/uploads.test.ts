// Uploading: the browser sends the file straight to storage, the api confirms it arrived as promised, and every
// organization's files count toward its storage limit, deleted ones included until a purge.
import { softDeleted } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bytesStored, createFiles } from "../../src/files/index.js";
import { DomainError, systemActor } from "../../src/kernel/index.js";
import {
  bytes,
  createOrganization,
  createTestFiles,
  memberOf,
  passportUpload,
  ref,
  type TestFiles,
} from "./test-files.js";

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
    // "if-none-match: *" is what stops a second PUT from replacing the file after it has been confirmed.
    expect(upload.headers).toEqual({
      "content-type": "application/pdf",
      "content-length": "11",
      "if-none-match": "*",
    });
    expect(upload.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);

    await test.storage.upload(upload, bytes("%PDF-passpt"), "application/pdf");
    const confirmed = await test.files.confirmUpload(sales, ref(attachment));

    expect(confirmed).toEqual({ ...attachment, status: "ready" });
    expect([...test.storage.objects.keys()]).toContain(`organizations/${organizationId}/attachments/${attachment.id}`);
    expect(await test.files.confirmUpload(sales, ref(attachment))).toEqual(confirmed);
  });

  it("lets only the system store files of a system-owned record, such as an issued document's PDF", async () => {
    const pdfOfDocument = passportUpload({
      recordType: "issued_document",
      fileName: "DOC-2026-0099.pdf",
      sizeBytes: 9,
    });
    for (const actor of [memberOf(organizationId, "org-owner"), systemActor(organizationId)]) {
      await expect(test.files.requestUpload(actor, pdfOfDocument)).rejects.toMatchObject({
        code: "FORBIDDEN",
        reason: "SYSTEM_OWNED_FILE",
      });
    }
    // The system's own path, which renders the PDF, still works.
    const stored = await test.files.storeGeneratedFile(systemActor(organizationId), {
      recordType: "issued_document",
      recordId: pdfOfDocument.recordId,
      fileName: "DOC-2026-0099.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-1.3 x"),
    });
    expect(stored).toMatchObject({ recordType: "issued_document", status: "ready" });
  });

  it("refuses to confirm a file that never arrived, or arrived different", async () => {
    const sales = memberOf(organizationId, "sales");
    const { attachment } = await test.files.requestUpload(sales, passportUpload());
    await expect(test.files.confirmUpload(sales, ref(attachment))).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "UPLOAD_NOT_FOUND",
    });
    await test.storage.put({
      key: `organizations/${organizationId}/attachments/${attachment.id}`,
      contentType: "text/html",
      body: bytes("<script>x()"),
    });
    await expect(test.files.confirmUpload(sales, ref(attachment))).rejects.toMatchObject({
      code: "VALIDATION",
      reason: "UPLOAD_DOES_NOT_MATCH",
    });
    expect(
      await test.files.list(sales, { recordType: "lead", recordId: passportUpload().recordId }),
    ).not.toContainEqual(expect.objectContaining({ id: attachment.id }));
  });

  it("refuses a stored file of the right type but another size", async () => {
    const sales = memberOf(organizationId, "sales");
    const { attachment } = await test.files.requestUpload(sales, passportUpload());
    await test.storage.put({
      key: `organizations/${organizationId}/attachments/${attachment.id}`,
      contentType: "application/pdf",
      body: bytes("%PDF-longer-than-announced"),
    });
    await expect(test.files.confirmUpload(sales, ref(attachment))).rejects.toMatchObject({
      code: "VALIDATION",
      reason: "UPLOAD_DOES_NOT_MATCH",
    });
  });

  it("hands the stored bytes to the caller's check, and keeps the file pending when it refuses them", async () => {
    const sales = memberOf(organizationId, "sales");
    const { attachment, upload } = await test.files.requestUpload(sales, passportUpload());
    await test.storage.upload(upload, bytes("%PDF-passpt"), "application/pdf");
    const seen: string[] = [];
    const refusing = (body: Uint8Array, declaredType: string) => {
      seen.push(`${new TextDecoder().decode(body)} as ${declaredType}`);
      throw new DomainError("VALIDATION", "LOGO_TOO_LARGE", "Too many pixels");
    };
    await expect(test.files.confirmUpload(sales, ref(attachment), refusing)).rejects.toMatchObject({
      reason: "LOGO_TOO_LARGE",
    });
    expect(seen).toEqual(["%PDF-passpt as application/pdf"]);
    expect(
      await test.files.list(sales, { recordType: "lead", recordId: passportUpload().recordId }),
    ).not.toContainEqual(expect.objectContaining({ id: attachment.id }));
    expect(await test.files.confirmUpload(sales, ref(attachment), () => undefined)).toMatchObject({ status: "ready" });
  });

  it("stores a file the server made once, however often the render job retries", async () => {
    const system = systemActor(organizationId);
    const file = {
      recordType: "issued_document",
      recordId: "0199e7a0-0000-7000-8000-0000000000d2",
      fileName: "DOC-2026-0002.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-1.3 once"),
      attachmentId: "0199e7a0-0000-7000-8000-0000000000a1",
    };
    const first = await test.files.storeGeneratedFile(system, file);
    const again = await test.files.storeGeneratedFile(system, { ...file, body: bytes("%PDF-1.3 other") });
    expect(first.id).toBe(file.attachmentId);
    expect(again).toEqual(first);
    expect(await test.storage.get(`organizations/${organizationId}/attachments/${first.id}`)).toEqual(
      bytes("%PDF-1.3 once"),
    );
    expect(await test.files.list(system, file)).toHaveLength(1);
    // The same id for another record is not this record's file.
    await expect(
      test.files.storeGeneratedFile(system, { ...file, recordId: "0199e7a0-0000-7000-8000-0000000000d3" }),
    ).rejects.toMatchObject({ code: "CONFLICT", reason: "ATTACHMENT_ID_IN_USE" });
  });

  it("answers with a generated sensitive file's name hidden from a caller who may not open it", async () => {
    const stored = await test.files.storeGeneratedFile(memberOf(organizationId, "sales"), {
      recordType: "lead",
      recordId: "0199e7a0-0000-7000-8000-0000000000d4",
      fileName: "Passport - Asha.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-pp"),
      sensitive: true,
    });
    expect(stored).toMatchObject({ fileName: "Sensitive file", sensitive: true, status: "ready" });
  });

  it("refuses a generated file whose name hides a folder or a direction mark", async () => {
    for (const fileName of ["../x.pdf", "invoice\u202Efdp.exe"]) {
      await expect(
        test.files.storeGeneratedFile(systemActor(organizationId), {
          recordType: "issued_document",
          recordId: "0199e7a0-0000-7000-8000-0000000000d1",
          fileName,
          contentType: "application/pdf",
          body: bytes("%PDF"),
        }),
      ).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_FILE_NAME" });
    }
  });

  it("refuses to confirm a file through another record", async () => {
    const sales = memberOf(organizationId, "sales");
    const { attachment } = await test.files.requestUpload(sales, passportUpload());
    const otherRecord = { ...ref(attachment), recordId: "0199e7a0-0000-7000-8000-0000000000e9" };
    const otherType = { ...ref(attachment), recordType: "booking" };
    for (const wrong of [otherRecord, otherType]) {
      await expect(test.files.confirmUpload(sales, wrong)).rejects.toMatchObject({
        code: "NOT_FOUND",
        reason: "ATTACHMENT_NOT_FOUND",
      });
    }
  });

  it("settles a chosen id that two first runs, a deleted file or another organization already hold", async () => {
    const system = systemActor(organizationId);
    const file = {
      recordType: "issued_document",
      recordId: "0199e7a0-0000-7000-8000-0000000000d4",
      fileName: "DOC-2026-0004.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-1.3 race"),
      attachmentId: "0199e7a0-0000-7000-8000-0000000000a2",
    };
    const [a, b] = await Promise.all([
      test.files.storeGeneratedFile(system, file),
      test.files.storeGeneratedFile(system, file),
    ]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ id: file.attachmentId, status: "ready" });

    const inUse = { code: "CONFLICT", reason: "ATTACHMENT_ID_IN_USE" };
    // An issued document's PDF can't be removed through the files API, so the deletion is made in the table.
    const owner = memberOf(organizationId, "org-owner");
    await test.db.forOrg(organizationId, (tx) =>
      tx.attachment.update({ where: { id: a.id }, data: softDeleted(owner.userId) }),
    );
    await expect(test.files.storeGeneratedFile(system, file)).rejects.toMatchObject(inUse);

    const otherOrganizationId = await createOrganization(test, "Another files agency");
    await expect(test.files.storeGeneratedFile(systemActor(otherOrganizationId), file)).rejects.toMatchObject(inUse);
  });

  it("completes a generated file whose first upload failed, with the retry's size and type", async () => {
    let puts = 0;
    const flaky = {
      ...test.storage,
      put: (object: Parameters<typeof test.storage.put>[0]) => {
        puts += 1;
        return puts === 1 ? Promise.reject(new Error("storage is down")) : test.storage.put(object);
      },
    };
    const files = createFiles({ db: test.db, storage: flaky });
    const system = systemActor(organizationId);
    const first = {
      recordType: "issued_document",
      recordId: "0199e7a0-0000-7000-8000-0000000000d5",
      fileName: "DOC-2026-0005.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-1.3 first"),
      attachmentId: "0199e7a0-0000-7000-8000-0000000000a3",
    };
    const before = await files.storageUsedBytes(organizationId);
    await expect(files.storeGeneratedFile(system, first)).rejects.toThrow("storage is down");

    const retried = await files.storeGeneratedFile(system, {
      ...first,
      contentType: "image/png",
      body: bytes("a longer png body than before"),
    });

    expect(retried).toMatchObject({ status: "ready", contentType: "image/png", sizeBytes: 29 });
    expect(await files.storageUsedBytes(organizationId)).toBe(before + 29);
    expect(await test.storage.head(`organizations/${organizationId}/attachments/${retried.id}`)).toEqual({
      sizeBytes: 29,
      contentType: "image/png",
    });
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
    await test.files.remove(owner, ref(attachment));

    expect(await test.files.storageUsedBytes(organizationId)).toBe(600);
    await expect(test.files.requestUpload(owner, passportUpload({ sizeBytes: 401 }))).rejects.toMatchObject({
      code: "LIMIT_REACHED",
      reason: "STORAGE_LIMIT_REACHED",
    });
    const { attachment: fits } = await test.files.requestUpload(owner, passportUpload({ sizeBytes: 400 }));
    expect(fits.sizeBytes).toBe(400);
  });

  it("counts a pending upload only while its upload link lasts, and a ready file for good", async () => {
    const organization = await createOrganization(test, "Unfinished uploads agency");
    const owner = memberOf(organization, "org-owner");
    const { attachment: left } = await test.files.requestUpload(owner, passportUpload({ sizeBytes: 600 }));
    const { attachment: kept, upload } = await test.files.requestUpload(owner, passportUpload({ sizeBytes: 11 }));
    await test.storage.upload(upload, bytes("%PDF-passpt"), "application/pdf");
    await test.files.confirmUpload(owner, ref(kept));
    expect(await test.files.storageUsedBytes(organization)).toBe(611);

    // Eleven minutes on, the link has lapsed: an upload that never finished counts no more, a ready file still does.
    const longAgo = new Date(Date.now() - 11 * 60 * 1000);
    await test.platform.attachment.updateMany({
      where: { id: { in: [left.id, kept.id] } },
      data: { createdAt: longAgo },
    });
    expect(await test.files.storageUsedBytes(organization)).toBe(11);
    const { attachment: fits } = await test.files.requestUpload(owner, passportUpload({ sizeBytes: 989 }));
    expect(fits.sizeBytes).toBe(989);
  });

  /** Asks for a 400-byte upload and sends it, as the browser would; confirming is left to the test. */
  async function sent(organization: string) {
    const owner = memberOf(organization, "org-owner");
    const { attachment, upload } = await test.files.requestUpload(owner, passportUpload({ sizeBytes: 400 }));
    await test.storage.upload(upload, new Uint8Array(400), "application/pdf");
    return attachment;
  }

  /** As if the upload had been asked for this long ago. */
  const askedAgo = (attachmentIds: string[], minutes: number) =>
    test.platform.attachment.updateMany({
      where: { id: { in: attachmentIds } },
      data: { createdAt: new Date(Date.now() - minutes * 60 * 1000) },
    });

  it("checks the limit again when an upload is confirmed after its link lapsed, so waiting can't double it", async () => {
    const organization = await createOrganization(test, "Patient agency");
    const owner = memberOf(organization, "org-owner");
    // Two uploads sent in time, then left: once their links lapse they count no more, so two more fit.
    const early = [await sent(organization), await sent(organization)];
    await askedAgo(
      early.map((attachment) => attachment.id),
      11,
    );
    const late = [await sent(organization), await sent(organization)];
    for (const attachment of late) {
      expect(await test.files.confirmUpload(owner, ref(attachment))).toMatchObject({ status: "ready" });
    }
    for (const attachment of early) {
      await expect(test.files.confirmUpload(owner, ref(attachment))).rejects.toMatchObject({
        code: "LIMIT_REACHED",
        reason: "STORAGE_LIMIT_REACHED",
      });
    }
    expect(await test.files.storageUsedBytes(organization)).toBe(800);
  });

  it("confirms an upload whose link lapsed while it still fits, but only one of two that don't both fit", async () => {
    const organization = await createOrganization(test, "Slow connection agency");
    const owner = memberOf(organization, "org-owner");
    const alone = await sent(organization);
    await askedAgo([alone.id], 11);
    expect(await test.files.confirmUpload(owner, ref(alone))).toMatchObject({ status: "ready" });
    // 400 stored, room for one more 400, and two lapsed uploads confirmed at the same moment: they take turns.
    const both = [];
    for (let count = 0; count < 2; count++) {
      const attachment = await sent(organization);
      await askedAgo([attachment.id], 11);
      both.push(attachment);
    }
    const answers = await Promise.allSettled(
      both.map((attachment) => test.files.confirmUpload(owner, ref(attachment))),
    );
    expect(answers.map((answer) => answer.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await test.files.storageUsedBytes(organization)).toBe(800);
  });

  it("refuses to confirm an upload asked for over an hour ago: it has to be sent again", async () => {
    const organization = await createOrganization(test, "Forgetful agency");
    const owner = memberOf(organization, "org-owner");
    const old = await sent(organization);
    await askedAgo([old.id], 61);
    await expect(test.files.confirmUpload(owner, ref(old))).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "UPLOAD_EXPIRED",
    });
    expect(await test.files.storageUsedBytes(organization)).toBe(0);
  });

  it("counts only the organization it names, even in a transaction that sees every organization's files", async () => {
    const other = await createOrganization(test, "Other agency");
    await test.files.requestUpload(memberOf(other, "org-owner"), passportUpload({ sizeBytes: 7 }));
    expect(await test.platform.$transaction((tx) => bytesStored(tx, other))).toBe(7);
  });
});
