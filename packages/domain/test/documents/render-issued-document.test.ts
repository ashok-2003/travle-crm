// The worker renders an issued document's PDF from its frozen content, once: never again, and into one attachment
// however many times or how many runs at once it is delivered. The organization's logo frozen in its branding is
// read from storage and drawn; one it can't draw, or a file that isn't the organization's logo, is left out.
import { issuedDocumentRenderInput } from "@travel-crm/contracts/documents";
import { renderPdf, UnprintableTextError } from "@travel-crm/integrations/pdf";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getIssuedDocument, issueDocument, renderIssuedDocumentListener } from "../../src/documents/index.js";
import { systemActor } from "../../src/kernel/index.js";
import {
  createOrganization,
  createTestDocuments,
  fakeRenderer,
  issuedEvent,
  listenerContext,
  quotation,
  storedLogo,
  tinyJpeg,
  tinyPng,
  type TestDocuments,
} from "./test-documents.js";

describe("rendering an issued document", () => {
  let test: TestDocuments;

  beforeAll(() => {
    test = createTestDocuments();
  });

  afterAll(async () => {
    await test.close();
  });

  async function issued(organizationId: string, logoAttachmentId?: string) {
    const branding = logoAttachmentId === undefined ? quotation.branding : { ...quotation.branding, logoAttachmentId };
    return test.db.forOrg(organizationId, (tx) =>
      issueDocument(tx, systemActor(organizationId), { ...quotation, branding }),
    );
  }

  /** What the renderer was handed for the organization's logo, after one run of the listener. */
  async function drawnLogo(organizationId: string, documentId: string) {
    const renderer = fakeRenderer();
    const listener = renderIssuedDocumentListener({ files: test.files, render: renderer.render });
    await listener.handle(await issuedEvent(test, organizationId, documentId), listenerContext(test, organizationId));
    expect(renderer.calls).toHaveLength(1);
    return renderer.calls[0]?.input.branding.logo;
  }

  it("renders the frozen content once and attaches the PDF to the document", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    const renderer = fakeRenderer();
    const listener = renderIssuedDocumentListener({ files: test.files, render: renderer.render });
    expect(listener).toMatchObject({ name: "documents.render-pdf", eventType: "document.issued" });

    await listener.handle(await issuedEvent(test, organizationId, document.id), listenerContext(test, organizationId));

    expect(renderer.calls).toHaveLength(1);
    expect(renderer.calls[0]?.input.data).toMatchObject({ number: document.number, title: "Quotation" });
    expect(renderer.calls[0]?.input.branding).toEqual(quotation.branding);
    // The one issue timestamp gives both the printed date and the file's date.
    expect(renderer.calls[0]?.input.issuedAt.toISOString()).toBe(document.issuedAt);
    const rendered = await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id }));
    expect(rendered.pdfAttachmentId).not.toBeNull();
    expect(rendered.renderedAt).not.toBeNull();
    const attachments = await test.files.list(systemActor(organizationId), {
      recordType: "issued_document",
      recordId: document.id,
    });
    expect(attachments).toMatchObject([
      { id: rendered.pdfAttachmentId, fileName: `${document.number}.pdf`, contentType: "application/pdf" },
    ]);
  });

  it("draws the logo frozen in the document's branding, read from storage", async () => {
    const organizationId = await createOrganization(test);
    const logoAttachmentId = await storedLogo(test, organizationId);
    const document = await issued(organizationId, logoAttachmentId);
    const stored = await test.db.forOrg(organizationId, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: document.id } }),
    );
    expect(issuedDocumentRenderInput.parse(stored.renderInput).branding.logoAttachmentId).toBe(logoAttachmentId);

    expect(await drawnLogo(organizationId, document.id)).toEqual({ data: tinyPng, contentType: "image/png" });
  });

  it("draws a logo as the image its bytes are, whatever type it was uploaded as", async () => {
    const organizationId = await createOrganization(test);
    const logoAttachmentId = await storedLogo(test, organizationId, { body: tinyJpeg, contentType: "image/png" });
    const document = await issued(organizationId, logoAttachmentId);
    expect(await drawnLogo(organizationId, document.id)).toEqual({ data: tinyJpeg, contentType: "image/jpeg" });
  });

  it("leaves out a logo it can't draw, and the document still renders", async () => {
    const organizationId = await createOrganization(test);
    const renamed = await storedLogo(test, organizationId, {
      body: new TextEncoder().encode("GIF89a, renamed"),
      contentType: "image/png",
    });
    const removed = await storedLogo(test, organizationId);
    await test.files.remove(systemActor(organizationId), {
      recordType: "organization_logo",
      recordId: organizationId,
      attachmentId: removed,
    });
    for (const logoAttachmentId of [renamed, removed]) {
      const document = await issued(organizationId, logoAttachmentId);
      expect(await drawnLogo(organizationId, document.id)).toBeUndefined();
      const rendered = await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id }));
      expect(rendered.pdfAttachmentId).not.toBeNull();
    }
  });

  it("never prints a file that isn't the organization's logo, such as a traveller's passport", async () => {
    const organizationId = await createOrganization(test);
    const passport = await test.files.storeGeneratedFile(systemActor(organizationId), {
      recordType: "lead",
      recordId: "0199e7a0-0000-7000-8000-0000000000f2",
      fileName: "Passport.png",
      contentType: "image/png",
      body: tinyPng,
    });
    const otherOrganization = await createOrganization(test);
    const othersLogo = await storedLogo(test, otherOrganization);
    for (const logoAttachmentId of [passport.id, othersLogo]) {
      const document = await issued(organizationId, logoAttachmentId);
      expect(await drawnLogo(organizationId, document.id)).toBeUndefined();
    }
  });

  it("never renders a document again once it has its PDF", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    const renderer = fakeRenderer();
    const listener = renderIssuedDocumentListener({ files: test.files, render: renderer.render });
    const event = await issuedEvent(test, organizationId, document.id);
    await listener.handle(event, listenerContext(test, organizationId));
    const storedBefore = test.storage.objects.size;

    await listener.handle(event, listenerContext(test, organizationId));

    expect(renderer.calls).toHaveLength(1);
    expect(test.storage.objects.size).toBe(storedBefore);
  });

  it("keeps one PDF when two runs race: both store into the document's one attachment", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    let release = (): void => undefined;
    const renderer = fakeRenderer(new Promise((resolve) => (release = resolve)));
    const listener = renderIssuedDocumentListener({ files: test.files, render: renderer.render });
    const event = await issuedEvent(test, organizationId, document.id);

    const runs = [
      listener.handle(event, listenerContext(test, organizationId)),
      listener.handle(event, listenerContext(test, organizationId)),
    ];
    // Both runs have checked for a PDF and are rendering before either stores one.
    await expect.poll(() => renderer.calls.length).toBe(2);
    release();
    await Promise.all(runs);

    const rendered = await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id }));
    const attachments = await test.files.list(systemActor(organizationId), {
      recordType: "issued_document",
      recordId: document.id,
    });
    expect(attachments.map((attachment) => attachment.id)).toEqual([rendered.pdfAttachmentId]);
  });

  it("re-runs into the same attachment after a crash between storing the PDF and marking the document", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    const stored = await test.db.forOrg(organizationId, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: document.id } }),
    );
    // The first run got as far as storing the PDF.
    await test.files.storeGeneratedFile(systemActor(organizationId), {
      recordType: "issued_document",
      recordId: document.id,
      fileName: `${document.number}.pdf`,
      contentType: "application/pdf",
      body: new TextEncoder().encode("%PDF-1.7 first run"),
      attachmentId: stored.pdfFileId,
    });

    const listener = renderIssuedDocumentListener({ files: test.files, render: fakeRenderer().render });
    await listener.handle(await issuedEvent(test, organizationId, document.id), listenerContext(test, organizationId));

    const rendered = await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id }));
    expect(rendered.pdfAttachmentId).toBe(stored.pdfFileId);
    const attachments = await test.files.list(systemActor(organizationId), {
      recordType: "issued_document",
      recordId: document.id,
    });
    expect(attachments.map((attachment) => attachment.id)).toEqual([stored.pdfFileId]);
    const key = `organizations/${organizationId}/attachments/${stored.pdfFileId}`;
    expect(new TextDecoder().decode(await test.storage.get(key))).toBe("%PDF-1.7 first run");
  });

  it("renders a real PDF with the brand's renderer", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    const listener = renderIssuedDocumentListener({ files: test.files, render: renderPdf });
    await listener.handle(await issuedEvent(test, organizationId, document.id), listenerContext(test, organizationId));

    const rendered = await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id }));
    const key = `organizations/${organizationId}/attachments/${rendered.pdfAttachmentId ?? ""}`;
    const pdf = await test.storage.get(key);
    expect(new TextDecoder().decode(pdf?.subarray(0, 5))).toBe("%PDF-");
    // The stored file is what the renderer makes from the frozen input and the one issue time, byte for byte.
    const stored = await test.db.forOrg(organizationId, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: document.id } }),
    );
    const again = await renderPdf("sample", {
      ...issuedDocumentRenderInput.parse(stored.renderInput),
      issuedAt: stored.issuedAt,
    });
    expect(Buffer.from(pdf ?? []).equals(Buffer.from(again))).toBe(true);
  });

  it("renders a real PDF with the organization's logo on it", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId, await storedLogo(test, organizationId));
    const listener = renderIssuedDocumentListener({ files: test.files, render: renderPdf });
    await listener.handle(await issuedEvent(test, organizationId, document.id), listenerContext(test, organizationId));
    const rendered = await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id }));
    const pdf = await test.storage.get(`organizations/${organizationId}/attachments/${rendered.pdfAttachmentId ?? ""}`);
    expect(new TextDecoder("latin1").decode(pdf ?? new Uint8Array())).toContain("/Subtype /Image");
  });

  it("records text the fonts can't show as a permanent failure instead of retrying", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    const render = vi.fn(() => Promise.reject(new UnprintableTextError(["ह"])));
    const listener = renderIssuedDocumentListener({ files: test.files, render });
    const event = await issuedEvent(test, organizationId, document.id);

    // Resolves, so the job is not retried; a redelivery does not render again either.
    await listener.handle(event, listenerContext(test, organizationId));
    await listener.handle(event, listenerContext(test, organizationId));

    expect(render).toHaveBeenCalledTimes(1);
    const stored = await test.db.forOrg(organizationId, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: document.id } }),
    );
    expect(stored.renderFailure).toBe("UNPRINTABLE_TEXT: U+0939");
    expect(stored.pdfAttachmentId).toBeNull();
    const summary = await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id }));
    expect(summary).toMatchObject({ pdfAttachmentId: null, renderFailed: true });
  });

  it("records a failure with no named characters as just its code", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    const bare = Object.assign(new Error("unprintable"), { code: "UNPRINTABLE_TEXT" });
    const listener = renderIssuedDocumentListener({ files: test.files, render: () => Promise.reject(bare) });
    await listener.handle(await issuedEvent(test, organizationId, document.id), listenerContext(test, organizationId));
    const stored = await test.db.forOrg(organizationId, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: document.id } }),
    );
    expect(stored.renderFailure).toBe("UNPRINTABLE_TEXT");
  });

  it("fails, so the job is retried, when the renderer breaks for any other reason", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId);
    const listener = renderIssuedDocumentListener({
      files: test.files,
      render: () => Promise.reject(new Error("out of memory")),
    });
    await expect(
      listener.handle(await issuedEvent(test, organizationId, document.id), listenerContext(test, organizationId)),
    ).rejects.toThrow("out of memory");
  });

  it("fails, so the job is retried, when the document can't be found", async () => {
    const organizationId = await createOrganization(test);
    const listener = renderIssuedDocumentListener({ files: test.files, render: fakeRenderer().render });
    const event = {
      id: "0199e7a0-0000-7000-8000-00000000e001",
      organizationId,
      type: "document.issued",
      payload: { documentId: "0199e7a0-0000-7000-8000-00000000d0c0" },
      occurredAt: new Date(),
    };
    await expect(listener.handle(event, listenerContext(test, organizationId))).rejects.toThrow(/not found/);
  });
});
