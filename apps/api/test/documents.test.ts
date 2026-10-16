// The documents screen's api (spec 9.3): a sample quotation issued from the profile and branding, logo included,
// numbered SMPL and kept like every issued document; the organization's documents newest first, a page at a time;
// and a short-lived link to a rendered PDF, asked for by a mutation from a session the database still holds, as every
// export is. Only roles with settings:manage reach them; read-only organizations may look and download, but issue
// nothing, and a suspended one's Owner may still list and download its PDFs. Samples are kept for good, so an
// organization issues at most SAMPLES_PER_DAY in any 24 hours.
import type { IssuedDocumentPage, IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import type { DownloadLinkOutput } from "@travel-crm/contracts/files";
import type { LogoUpload, OrganizationLogo } from "@travel-crm/contracts/profile";
import { issuedDocumentRenderInput } from "@travel-crm/contracts/documents";
import {
  brandedSampleQuotation,
  issueDocument,
  renderIssuedDocumentListener,
  SAMPLE_PREFIX,
  SAMPLES_PER_DAY,
} from "@travel-crm/domain/documents";
import { runListenerJob } from "@travel-crm/domain/jobs";
import { renderPdf } from "@travel-crm/integrations/pdf";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { tinyPng } from "@travel-crm/integrations/testing";
import { addStaff, ownerAccess, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const profile = {
  legalName: "Konkan Trails LLP",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "12 Hill Road, Bandra, Mumbai 400050",
  contactName: "Lakshmi Nair",
  contactPhone: "+91 98200 12345",
  bankAccountName: "Konkan Trails LLP",
  bankAccountNumber: "001234567890",
  bankIfsc: "HDFC0001234",
  bankName: "HDFC Bank",
  invoicePrefix: "KT",
};

describe("issued documents", () => {
  let server: TestServer;
  let storage: MemoryStorage;

  beforeAll(() => {
    storage = createMemoryStorage();
    server = createTestServer({}, { storage });
  });

  afterAll(async () => {
    await server.close();
  });

  /** An agency whose Owner has saved the business details and the branding, signed in. */
  async function brandedAgency(): Promise<{ agency: TestAgency; jar: CookieJar }> {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    await dataOf(await mutate(server, "organization.profile.update", profile, jar));
    await dataOf(
      await mutate(
        server,
        "organization.branding.update",
        { brandColour: "#1F6F5C", documentTerms: "50% to book." },
        jar,
      ),
    );
    return { agency, jar };
  }

  async function uploadedLogo(jar: CookieJar): Promise<OrganizationLogo> {
    const { attachmentId, upload } = await dataOf<LogoUpload>(
      await mutate(
        server,
        "organization.logo.requestUpload",
        { fileName: "Logo.png", contentType: "image/png", sizeBytes: tinyPng.byteLength },
        jar,
      ),
    );
    await storage.upload({ ...upload, expiresAt: new Date(upload.expiresAt) }, tinyPng, "image/png");
    return dataOf<OrganizationLogo>(await mutate(server, "organization.logo.confirmUpload", { attachmentId }, jar));
  }

  const issueSample = async (jar: CookieJar) =>
    dataOf<IssuedDocumentSummary>(await mutate(server, "documents.issueSample", undefined, jar));

  /** What the worker does after issuing: run the render listener for the document.issued event. */
  async function rendered(agency: TestAgency, documentId: string): Promise<void> {
    const event = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: "document.issued", payload: { equals: { documentId } } } }),
    );
    const listener = renderIssuedDocumentListener({ files: server.files, render: renderPdf });
    expect(
      await runListenerJob({
        db: server.db,
        listener,
        data: { organizationId: agency.organizationId, eventId: event.id, eventType: event.type },
      }),
    ).toBe("handled");
  }

  it("issues a sample quotation from the profile and branding, with the logo frozen in it", async () => {
    const { agency, jar } = await brandedAgency();
    const logo = await uploadedLogo(jar);
    const sample = await issueSample(jar);
    expect(sample).toMatchObject({
      template: "sample",
      title: "Quotation",
      pdfAttachmentId: null,
      renderFailed: false,
    });
    expect(sample.number).toMatch(/^SMPL-\d{4}-0001$/);

    const stored = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: sample.id } }),
    );
    expect(issuedDocumentRenderInput.parse(stored.renderInput).branding).toEqual({
      organizationName: "Test agency",
      accentColour: "#1f6f5c",
      terms: "50% to book.",
      logoAttachmentId: logo.attachmentId,
    });
    // Kept, as every issued document is: the next sample has the next number.
    expect((await issueSample(jar)).number).toMatch(/^SMPL-\d{4}-0002$/);
  });

  it("gives a short-lived link to the PDF once the worker has rendered it, logo and all", async () => {
    const { agency, jar } = await brandedAgency();
    await uploadedLogo(jar);
    const sample = await issueSample(jar);
    expect(await refusalOf(await mutate(server, "documents.downloadLink", { documentId: sample.id }, jar))).toEqual({
      status: 404,
      reason: "DOCUMENT_NOT_READY",
    });

    await rendered(agency, sample.id);
    const ready = await dataOf<IssuedDocumentSummary>(
      await query(server, "documents.get", jar, { documentId: sample.id }),
    );
    expect(ready.pdfAttachmentId).not.toBeNull();
    const link = await dataOf<DownloadLinkOutput>(
      await mutate(server, "documents.downloadLink", { documentId: sample.id }, jar),
    );
    const key = `organizations/${agency.organizationId}/attachments/${ready.pdfAttachmentId ?? ""}`;
    expect(link.url).toContain(encodeURIComponent(key));
    expect(link.url).toContain(encodeURIComponent(`${sample.number}.pdf`));
    expect(new Date(link.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    const pdf = new TextDecoder("latin1").decode(storage.objects.get(key)?.body);
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toContain("/Subtype /Image");
  });

  it("gives a PDF's link only to a session the database still holds, not the cookie cache alone", async () => {
    const { agency, jar } = await brandedAgency();
    const sample = await issueSample(jar);
    await rendered(agency, sample.id);
    await server.platform.session.deleteMany({ where: { userId: agency.owner.userId } });
    // The cookie cache still vouches for the session, which the list accepts; handing out the PDF doesn't.
    expect((await query(server, "documents.list", jar, {})).status).toBe(200);
    expect((await mutate(server, "documents.downloadLink", { documentId: sample.id }, jar)).status).toBe(401);
  });

  it("lists the organization's documents newest first, a page at a time", async () => {
    const { jar } = await brandedAgency();
    const issued = [await issueSample(jar), await issueSample(jar), await issueSample(jar)];
    const first = await dataOf<IssuedDocumentPage>(await query(server, "documents.list", jar, { limit: 2 }));
    expect(first.documents.map((document) => document.id)).toEqual([issued[2]?.id, issued[1]?.id]);
    const rest = await dataOf<IssuedDocumentPage>(
      await query(server, "documents.list", jar, { limit: 2, cursor: first.nextCursor }),
    );
    expect(rest).toEqual({ documents: [issued[0]], nextCursor: null });
  });

  it("says a PDF that can never be made can't be downloaded", async () => {
    const { agency, jar } = await brandedAgency();
    const sample = await issueSample(jar);
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.issuedDocument.update({ where: { id: sample.id }, data: { renderFailure: "UNPRINTABLE_TEXT: U+0939" } }),
    );
    expect(await refusalOf(await mutate(server, "documents.downloadLink", { documentId: sample.id }, jar))).toEqual({
      status: 404,
      reason: "DOCUMENT_UNAVAILABLE",
    });
    const { documents } = await dataOf<IssuedDocumentPage>(await query(server, "documents.list", jar, {}));
    expect(documents).toMatchObject([{ id: sample.id, renderFailed: true }]);
  });

  it("refuses a sample past the day's, as each is kept for good", async () => {
    const { agency, jar } = await brandedAgency();
    const owner = await ownerAccess(server, agency);
    const sample = brandedSampleQuotation({
      organizationName: "Test agency",
      profile: { gstStateCode: "27", brandColour: null, documentTerms: null },
    });
    await server.db.forOrg(agency.organizationId, async (tx) => {
      for (let count = 0; count < SAMPLES_PER_DAY; count++) {
        await issueDocument(tx, owner, { ...sample, prefix: SAMPLE_PREFIX });
      }
    });
    expect(await refusalOf(await mutate(server, "documents.issueSample", undefined, jar))).toEqual({
      status: 403,
      reason: "SAMPLE_LIMIT_REACHED",
    });
  });

  it("refuses a sample before the business details, and another organization's document", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    expect(await refusalOf(await mutate(server, "documents.issueSample", undefined, jar))).toEqual({
      status: 409,
      reason: "PROFILE_NOT_SAVED",
    });
    const { jar: otherJar } = await brandedAgency();
    const theirs = await issueSample(otherJar);
    const notFound = { status: 404, reason: "DOCUMENT_NOT_FOUND" };
    expect(await refusalOf(await query(server, "documents.get", jar, { documentId: theirs.id }))).toEqual(notFound);
    expect(await refusalOf(await mutate(server, "documents.downloadLink", { documentId: theirs.id }, jar))).toEqual(
      notFound,
    );
    expect(await dataOf<IssuedDocumentPage>(await query(server, "documents.list", jar, {}))).toEqual({
      documents: [],
      nextCursor: null,
    });
  });

  it("refuses staff without settings:manage", async () => {
    const { agency, jar } = await brandedAgency();
    const sample = await issueSample(jar);
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const salesJar = await signedInStaff(server, agency, sales);
    const refused = { status: 403, reason: "MISSING_PERMISSION" };
    expect(await refusalOf(await mutate(server, "documents.issueSample", undefined, salesJar))).toEqual(refused);
    for (const [path, input] of [
      ["documents.list", {}],
      ["documents.get", { documentId: sample.id }],
    ] as const) {
      expect(await refusalOf(await query(server, path, salesJar, input)), path).toEqual(refused);
    }
    expect(
      await refusalOf(await mutate(server, "documents.downloadLink", { documentId: sample.id }, salesJar)),
    ).toEqual(refused);
  });

  it("lets a suspended organization's Owner list and download its PDFs, as exports, and nobody else", async () => {
    const { agency, jar } = await brandedAgency();
    const sample = await issueSample(jar);
    await rendered(agency, sample.id);
    const admin = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "priya", roleKey: "org-admin" }),
    );
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "suspended", statusChangedAt: new Date(), trialEndsOn: null },
    });
    const ref = { documentId: sample.id };
    expect(await dataOf<IssuedDocumentPage>(await query(server, "documents.list", jar, {}))).toMatchObject({
      documents: [{ id: sample.id }],
    });
    expect((await mutate(server, "documents.downloadLink", ref, jar)).status).toBe(200);
    const suspended = { status: 403, reason: "ORGANIZATION_SUSPENDED" };
    expect(await refusalOf(await query(server, "documents.list", admin, {}))).toEqual(suspended);
    expect(await refusalOf(await mutate(server, "documents.downloadLink", ref, admin))).toEqual(suspended);
    expect(await refusalOf(await query(server, "documents.get", jar, ref))).toEqual(suspended);
    expect(await refusalOf(await mutate(server, "documents.issueSample", undefined, jar))).toEqual(suspended);
  });

  it("lets a read-only organization's Owner look and download, but issue nothing", async () => {
    const { agency, jar } = await brandedAgency();
    const sample = await issueSample(jar);
    await rendered(agency, sample.id);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    expect((await query(server, "documents.list", jar, {})).status).toBe(200);
    expect((await mutate(server, "documents.downloadLink", { documentId: sample.id }, jar)).status).toBe(200);
    expect(await refusalOf(await mutate(server, "documents.issueSample", undefined, jar))).toEqual({
      status: 403,
      reason: "ORGANIZATION_READ_ONLY",
    });
  });
});
