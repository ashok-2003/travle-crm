// The agency's own papers over HTTP (spec 9.2): files on its organization record, uploaded straight to storage and
// confirmed, listed, downloaded by a short-lived link and removed, with settings:manage. Any other record is "not
// found"; a sensitive file's name, download and removal are for documents:view_sensitive; the storage limit refuses
// with its reason; a read-only organization may list and download but not upload or remove.
import type { AttachmentSummary, DownloadLinkOutput, PresignedUploadOutput } from "@travel-crm/contracts/files";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, ownerAccess, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const PDF = new TextEncoder().encode("%PDF-1.4 a GST registration certificate");

interface Uploaded {
  attachment: AttachmentSummary;
  upload: PresignedUploadOutput;
}

describe("attachments", () => {
  let server: TestServer;
  let storage: MemoryStorage;

  beforeAll(() => {
    storage = createMemoryStorage();
    server = createTestServer({}, { storage });
  });

  afterAll(async () => {
    await server.close();
  });

  const papers = (agency: TestAgency) => ({ recordType: "organization", recordId: agency.organizationId });

  /** Asks for an upload, sends the file as the browser would, and confirms it. */
  async function uploaded(
    agency: TestAgency,
    jar: CookieJar,
    file: { fileName: string; sensitive?: boolean },
  ): Promise<AttachmentSummary> {
    const asked = await dataOf<Uploaded>(
      await mutate(
        server,
        "attachments.requestUpload",
        { ...papers(agency), contentType: "application/pdf", sizeBytes: PDF.byteLength, ...file },
        jar,
      ),
    );
    await storage.upload({ ...asked.upload, expiresAt: new Date(asked.upload.expiresAt) }, PDF, "application/pdf");
    return dataOf<AttachmentSummary>(
      await mutate(server, "attachments.confirmUpload", { ...papers(agency), attachmentId: asked.attachment.id }, jar),
    );
  }

  it("lets the Owner upload the agency's papers, list them, download one by a short-lived link and remove it", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const asked = await dataOf<Uploaded>(
      await mutate(
        server,
        "attachments.requestUpload",
        {
          ...papers(agency),
          fileName: "GST certificate.pdf",
          contentType: "application/pdf",
          sizeBytes: PDF.byteLength,
        },
        jar,
      ),
    );
    expect(asked.attachment).toMatchObject({ status: "pending", sensitive: false, fileName: "GST certificate.pdf" });
    expect(asked.upload).toMatchObject({ method: "PUT", headers: { "content-type": "application/pdf" } });
    expect(new Date(asked.upload.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // Nothing is listed until storage holds the file and the upload is confirmed.
    expect(await dataOf(await query(server, "attachments.list", jar, papers(agency)))).toEqual([]);

    await storage.upload({ ...asked.upload, expiresAt: new Date(asked.upload.expiresAt) }, PDF, "application/pdf");
    const file = { ...papers(agency), attachmentId: asked.attachment.id };
    const ready = await dataOf<AttachmentSummary>(await mutate(server, "attachments.confirmUpload", file, jar));
    expect(ready).toMatchObject({ status: "ready", sizeBytes: PDF.byteLength });
    expect(await dataOf(await query(server, "attachments.list", jar, papers(agency)))).toEqual([ready]);

    const link = await dataOf<DownloadLinkOutput>(await mutate(server, "attachments.downloadLink", file, jar));
    expect(link.url).toContain(encodeURIComponent("GST certificate.pdf"));
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());

    expect((await mutate(server, "attachments.remove", file, jar)).status).toBe(200);
    expect(await dataOf(await query(server, "attachments.list", jar, papers(agency)))).toEqual([]);
  });

  it("refuses any record but the member's own organization, as not found", async () => {
    const agency = await createTestAgency(server);
    const other = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const theirs = await uploaded(other, await signedInOwner(server, other), { fileName: "PAN card.pdf" });
    const records = [
      papers(other),
      { recordType: "lead", recordId: crypto.randomUUID() },
      { recordType: "organization_logo", recordId: agency.organizationId },
      { recordType: "issued_document", recordId: crypto.randomUUID() },
    ];
    for (const record of records) {
      const upload = { ...record, fileName: "x.pdf", contentType: "application/pdf", sizeBytes: 10 };
      const file = { ...record, attachmentId: theirs.id };
      for (const response of [
        await query(server, "attachments.list", jar, record),
        await mutate(server, "attachments.requestUpload", upload, jar),
        await mutate(server, "attachments.confirmUpload", file, jar),
        await mutate(server, "attachments.downloadLink", file, jar),
        await mutate(server, "attachments.remove", file, jar),
      ]) {
        expect(await refusalOf(response), record.recordType).toEqual({ status: 404, reason: "NOT_FOUND" });
      }
    }
  });

  it("refuses staff without settings:manage", async () => {
    const agency = await createTestAgency(server);
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, sales);
    expect(await refusalOf(await query(server, "attachments.list", jar, papers(agency)))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    const upload = { ...papers(agency), fileName: "x.pdf", contentType: "application/pdf", sizeBytes: 10 };
    expect(await refusalOf(await mutate(server, "attachments.requestUpload", upload, jar))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
  });

  it("keeps a sensitive file's name, download and removal to documents:view_sensitive", async () => {
    const agency = await createTestAgency(server);
    const ownerJar = await signedInOwner(server, agency);
    const role = await server.identity.roles.create(await ownerAccess(server, agency), {
      name: "Office manager",
      permissions: [{ permission: "settings:manage" }],
    });
    const manager = await addStaff(server, agency, { username: "meera", roleKey: role.key });
    const managerJar = await signedInStaff(server, agency, manager);
    const cheque = await uploaded(agency, ownerJar, { fileName: "Cancelled cheque.pdf", sensitive: true });
    const file = { ...papers(agency), attachmentId: cheque.id };

    expect(await dataOf(await query(server, "attachments.list", managerJar, papers(agency)))).toEqual([
      { ...cheque, fileName: "Sensitive file" },
    ]);
    for (const path of ["attachments.downloadLink", "attachments.remove"]) {
      expect(await refusalOf(await mutate(server, path, file, managerJar)), path).toEqual({
        status: 403,
        reason: "MISSING_PERMISSION",
      });
    }
    expect(await dataOf(await query(server, "attachments.list", ownerJar, papers(agency)))).toEqual([cheque]);
    expect((await mutate(server, "attachments.remove", file, ownerJar)).status).toBe(200);
  });

  it("refuses an upload past the plan's storage limit, with its reason", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const plan = await server.platform.plan.create({
      data: {
        key: `tiny-storage-${agency.organizationId.slice(-12)}`,
        name: "Tiny storage",
        monthlyPricePaise: 0,
        seatLimit: 10,
        whatsappNumberLimit: 0,
        storageLimitBytes: 1000n,
        modules: [],
      },
    });
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { planId: plan.id },
    });
    const upload = { ...papers(agency), fileName: "Licence.pdf", contentType: "application/pdf", sizeBytes: 1001 };
    expect(await refusalOf(await mutate(server, "attachments.requestUpload", upload, jar))).toEqual({
      status: 403,
      reason: "STORAGE_LIMIT_REACHED",
    });
  });

  it("lets a read-only organization list and download its papers, but not upload or remove them", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    const licence = await uploaded(agency, jar, { fileName: "Tour operator licence.pdf" });
    const file = { ...papers(agency), attachmentId: licence.id };
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    expect(await dataOf(await query(server, "attachments.list", jar, papers(agency)))).toEqual([licence]);
    expect((await mutate(server, "attachments.downloadLink", file, jar)).status).toBe(200);
    const upload = { ...papers(agency), fileName: "x.pdf", contentType: "application/pdf", sizeBytes: 10 };
    for (const [path, input] of [
      ["attachments.requestUpload", upload],
      ["attachments.remove", file],
    ] as const) {
      expect(await refusalOf(await mutate(server, path, input, jar)), path).toEqual({
        status: 403,
        reason: "ORGANIZATION_READ_ONLY",
      });
    }
  });
});
