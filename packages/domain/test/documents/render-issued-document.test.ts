// The worker renders an issued document's PDF from its frozen content, once: never again, and into one attachment
// however many times or how many runs at once it is delivered.
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

  async function issued(organizationId: string) {
    return test.db.forOrg(organizationId, (tx) =>
      issueDocument(tx, systemActor(organizationId), { ...quotation, timeZone: "Asia/Kolkata" }),
    );
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
