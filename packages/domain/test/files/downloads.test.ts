// Downloading: short-lived links, sensitive files only for those allowed to see them, and nothing across
// organizations.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import {
  bytes,
  createOrganization,
  createTestFiles,
  memberOf,
  passportUpload,
  ref,
  type TestFiles,
} from "./test-files.js";

describe("downloading files", () => {
  let test: TestFiles;
  let organizationId: string;
  let otherOrganizationId: string;

  /** Uploads and confirms a file as the given member. */
  async function uploaded(member: MemberAccess, sensitive: boolean, fileName = "Passport - Asha.pdf") {
    const { attachment, upload } = await test.files.requestUpload(member, passportUpload({ sensitive, fileName }));
    await test.storage.upload(upload, bytes("%PDF-passpt"), "application/pdf");
    return test.files.confirmUpload(member, ref(attachment));
  }

  beforeAll(async () => {
    test = createTestFiles();
    organizationId = await createOrganization(test);
    otherOrganizationId = await createOrganization(test, "Other agency");
  });

  afterAll(async () => {
    await test.close();
  });

  it("gives a five-minute link that downloads the file under its own name", async () => {
    const sales = memberOf(organizationId, "sales");
    const file = await uploaded(sales, false, "Itinerary.pdf");
    const link = await test.files.downloadLink(sales, ref(file));
    expect(link.url).toContain(encodeURIComponent(`organizations/${organizationId}/attachments/${file.id}`));
    expect(link.url).toContain("name=Itinerary.pdf");
    expect(link.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(link.expiresAt.getTime() - Date.now()).toBeGreaterThan(4 * 60 * 1000);
  });

  it("refuses a link to a file that hasn't arrived yet", async () => {
    const sales = memberOf(organizationId, "sales");
    const { attachment } = await test.files.requestUpload(sales, passportUpload());
    await expect(test.files.downloadLink(sales, ref(attachment))).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "ATTACHMENT_NOT_FOUND",
    });
  });

  it("shows sensitive files only to those holding documents:view_sensitive", async () => {
    const operations = memberOf(organizationId, "operations");
    const passport = await uploaded(operations, true);
    await expect(test.files.downloadLink(memberOf(organizationId, "sales"), ref(passport))).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "MISSING_PERMISSION",
    });
    await expect(test.files.downloadLink(memberOf(organizationId, "accounts"), ref(passport))).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "MISSING_PERMISSION",
    });
    expect((await test.files.downloadLink(operations, ref(passport))).url).toContain(passport.id);
    expect((await test.files.downloadLink(memberOf(organizationId, "org-owner"), ref(passport))).url).toContain(
      passport.id,
    );
  });

  it("gives trusted server code a link to an ordinary file, never to a sensitive one", async () => {
    const operations = memberOf(organizationId, "operations");
    const itinerary = await uploaded(operations, false, "Itinerary.pdf");
    const passport = await uploaded(operations, true);
    expect((await test.files.systemDownloadLink(organizationId, ref(itinerary))).url).toContain(itinerary.id);
    await expect(test.files.systemDownloadLink(organizationId, ref(passport))).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "SENSITIVE_FILE",
    });
  });

  it("hides a sensitive file's name from those who may not open it", async () => {
    const operations = memberOf(organizationId, "operations");
    const record = { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000e2" };
    await test.files.storeGeneratedFile(operations, {
      ...record,
      fileName: "Passport - Asha.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-pp"),
      sensitive: true,
    });
    await test.files.storeGeneratedFile(operations, {
      ...record,
      fileName: "Itinerary.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-it"),
    });
    const names = async (member: MemberAccess) =>
      (await test.files.list(member, record)).map((file) => [file.fileName, file.sizeBytes, file.sensitive]);

    expect(await names(operations)).toEqual([
      ["Passport - Asha.pdf", 7, true],
      ["Itinerary.pdf", 7, false],
    ]);
    expect(await names(memberOf(organizationId, "sales"))).toEqual([
      ["Sensitive file", 7, true],
      ["Itinerary.pdf", 7, false],
    ]);
  });

  it("lists a record's ready files, sensitive ones marked, removed ones gone", async () => {
    const operations = memberOf(organizationId, "operations");
    const record = { recordType: "lead", recordId: "0199e7a0-0000-7000-8000-0000000000e1" };
    const visa = await test.files.storeGeneratedFile(operations, {
      ...record,
      fileName: "Visa.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-visa"),
      sensitive: true,
    });
    const ticket = await test.files.storeGeneratedFile(operations, {
      ...record,
      fileName: "Ticket.pdf",
      contentType: "application/pdf",
      body: bytes("%PDF-ticket"),
    });
    await test.files.requestUpload(operations, passportUpload(record));

    expect((await test.files.list(operations, record)).map((file) => [file.fileName, file.sensitive])).toEqual([
      ["Visa.pdf", true],
      ["Ticket.pdf", false],
    ]);
    await test.files.remove(operations, ref(ticket));
    expect((await test.files.list(operations, record)).map((file) => file.id)).toEqual([visa.id]);
    await expect(test.files.downloadLink(operations, ref(ticket))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("serves and removes a file only through its own record", async () => {
    const operations = memberOf(organizationId, "operations");
    const file = await uploaded(operations, false, "Ticket.pdf");
    const wrong = [
      { ...ref(file), recordId: "0199e7a0-0000-7000-8000-0000000000e8" },
      { ...ref(file), recordType: "booking" },
    ];
    for (const attachmentRef of wrong) {
      await expect(test.files.downloadLink(operations, attachmentRef)).rejects.toMatchObject({
        code: "NOT_FOUND",
        reason: "ATTACHMENT_NOT_FOUND",
      });
      await expect(test.files.remove(operations, attachmentRef)).rejects.toMatchObject({
        code: "NOT_FOUND",
        reason: "ATTACHMENT_NOT_FOUND",
      });
    }
    expect((await test.files.downloadLink(operations, ref(file))).url).toContain(file.id);
  });

  it("lets only those who may open a sensitive file remove it", async () => {
    const operations = memberOf(organizationId, "operations");
    const passport = await uploaded(operations, true);
    await expect(test.files.remove(memberOf(organizationId, "sales"), ref(passport))).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "MISSING_PERMISSION",
    });
    await test.files.remove(operations, ref(passport));
    await expect(test.files.downloadLink(operations, ref(passport))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets another organization neither confirm, list, download nor remove a file", async () => {
    const operations = memberOf(organizationId, "operations");
    const file = await uploaded(operations, false, "Ticket.pdf");
    const outsider = memberOf(otherOrganizationId, "org-owner");
    const notFound = { code: "NOT_FOUND", reason: "ATTACHMENT_NOT_FOUND" };

    await expect(test.files.confirmUpload(outsider, ref(file))).rejects.toMatchObject(notFound);
    await expect(test.files.downloadLink(outsider, ref(file))).rejects.toMatchObject(notFound);
    await expect(test.files.systemDownloadLink(otherOrganizationId, ref(file))).rejects.toMatchObject(notFound);
    await expect(test.files.remove(outsider, ref(file))).rejects.toMatchObject(notFound);
    expect(await test.files.list(outsider, { recordType: file.recordType, recordId: file.recordId })).toEqual([]);
    expect((await test.files.downloadLink(operations, ref(file))).url).toContain(file.id);
  });
});
