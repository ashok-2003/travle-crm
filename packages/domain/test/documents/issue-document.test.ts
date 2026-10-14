// Issuing a document numbers it in its organization and year, freezes what it says, and publishes document.issued,
// all in the caller's transaction.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getIssuedDocument, issueDocument } from "../../src/documents/index.js";
import { DomainError, systemActor, type Actor } from "../../src/kernel/index.js";
import { createOrganization, createTestDocuments, quotation, type TestDocuments } from "./test-documents.js";

const october15 = new Date("2026-10-15T06:30:00Z");

describe("issueDocument", () => {
  let test: TestDocuments;
  let organizationId: string;
  let owner: Actor;

  beforeAll(async () => {
    test = createTestDocuments();
    organizationId = await createOrganization(test);
    owner = { organizationId, userId: "0199e7a0-0000-7000-8000-0000000000a1", source: "web", impersonatedBy: null };
  });

  afterAll(async () => {
    await test.close();
  });

  it("numbers the document, freezes what it says, and publishes document.issued", async () => {
    const issue = () => test.db.forOrg(organizationId, (tx) => issueDocument(tx, owner, { ...quotation }, october15));
    const first = await issue();
    const second = await issue();

    expect(first).toEqual({
      id: first.id,
      template: "sample",
      number: "DOC-2026-0001",
      title: "Quotation",
      issuedAt: october15.toISOString(),
      issuedBy: owner.userId,
      pdfAttachmentId: null,
      renderedAt: null,
      renderFailed: false,
    });
    expect(second.number).toBe("DOC-2026-0002");

    const stored = await test.db.forOrg(organizationId, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: first.id } }),
    );
    expect(stored.renderInput).toEqual({
      data: { ...quotation.content, number: "DOC-2026-0001", issuedOn: "15 Oct 2026" },
      branding: quotation.branding,
    });
    // The PDF's attachment id is chosen now, so a retried render stores into the same attachment.
    expect(stored.pdfFileId).toMatch(/^[0-9a-f-]{36}$/);
    const events = await test.db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "document.issued" }, orderBy: { id: "asc" } }),
    );
    expect(events.map((event) => event.payload)).toEqual([{ documentId: first.id }, { documentId: second.id }]);
  });

  it("counts the year and the date in the organization's time zone", async () => {
    const lateOnNewYearsEve = new Date("2026-12-31T19:00:00Z");
    const india = await createOrganization(test);
    const inIndia = await test.db.forOrg(india, (tx) =>
      issueDocument(tx, systemActor(india), { ...quotation }, lateOnNewYearsEve),
    );
    expect(inIndia.number).toBe("DOC-2027-0001");
    const indiaStored = await test.db.forOrg(india, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: inIndia.id } }),
    );
    expect(indiaStored.renderInput).toMatchObject({ data: { issuedOn: "1 Jan 2027" } });

    const london = await createOrganization(test, "Europe/London");
    const inLondon = await test.db.forOrg(london, (tx) =>
      issueDocument(tx, systemActor(london), { ...quotation, prefix: "QT" }, lateOnNewYearsEve),
    );
    expect(inLondon.number).toBe("QT-2026-0001");
    const stored = await test.db.forOrg(london, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: inLondon.id } }),
    );
    expect(stored.renderInput).toMatchObject({ data: { issuedOn: "31 Dec 2026" } });
  });

  it("issues nothing, and publishes nothing, when the caller's transaction rolls back", async () => {
    const organization = await createOrganization(test);
    await expect(
      test.db.forOrg(organization, async (tx) => {
        await issueDocument(tx, systemActor(organization), { ...quotation });
        throw new Error("the quote could not be saved");
      }),
    ).rejects.toThrow("the quote could not be saved");
    const left = await test.db.forOrg(organization, async (tx) => ({
      documents: await tx.issuedDocument.count(),
      events: await tx.outboxEvent.count(),
    }));
    expect(left).toEqual({ documents: 0, events: 0 });
    // The number the rolled-back document took came back with it.
    const again = await test.db.forOrg(organization, (tx) =>
      issueDocument(tx, systemActor(organization), { ...quotation }, october15),
    );
    expect(again.number).toBe("DOC-2026-0001");
  });

  it("refuses text its PDF can't show, before it uses a number", async () => {
    const organization = await createOrganization(test);
    const hindi = {
      ...quotation,
      content: { ...quotation.content, rows: [{ description: "होटल", amount: "₹4,000.00" }] },
    };
    const refusal = test.db.forOrg(organization, (tx) => issueDocument(tx, systemActor(organization), hindi));
    await expect(refusal).rejects.toBeInstanceOf(DomainError);
    await expect(refusal).rejects.toMatchObject({ code: "VALIDATION", reason: "UNPRINTABLE_CHARACTERS" });
    const next = await test.db.forOrg(organization, (tx) =>
      issueDocument(tx, systemActor(organization), { ...quotation }, october15),
    );
    expect(next.number).toBe("DOC-2026-0001");
  });

  it("refuses a document the contract refuses, before it uses a number", async () => {
    const organization = await createOrganization(test);
    const issue = (content: Partial<typeof quotation.content>) =>
      test.db.forOrg(organization, (tx) =>
        issueDocument(
          tx,
          systemActor(organization),
          { ...quotation, content: { ...quotation.content, ...content } },
          october15,
        ),
      );
    // A line break passes the print check but is not allowed in a title.
    await expect(issue({ title: "Quo\ntation" })).rejects.toMatchObject({
      code: "VALIDATION",
      reason: "INVALID_DOCUMENT",
    });
    await expect(issue({ rows: [] })).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_DOCUMENT" });
    await expect(issue({ rows: [{ description: "x".repeat(501), amount: "₹1.00" }] })).rejects.toMatchObject({
      code: "VALIDATION",
      reason: "INVALID_DOCUMENT",
    });

    const next = await issue({});
    expect(next.number).toBe("DOC-2026-0001");
  });

  it("freezes the trimmed text, which is what prints", async () => {
    const organization = await createOrganization(test);
    const issued = await test.db.forOrg(organization, (tx) =>
      issueDocument(tx, systemActor(organization), {
        ...quotation,
        content: { ...quotation.content, title: "  Quotation  " },
      }),
    );
    expect(issued.title).toBe("Quotation");
    const stored = await test.db.forOrg(organization, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: issued.id } }),
    );
    expect(stored.renderInput).toMatchObject({ data: { title: "Quotation" } });
  });

  it("refuses to store a PDF other than the one chosen for the document, or a failure beside a PDF", async () => {
    const organization = await createOrganization(test);
    const issued = await test.db.forOrg(organization, (tx) => issueDocument(tx, systemActor(organization), quotation));
    const other = "0199e7a0-0000-7000-8000-0000000000b1";
    await expect(
      test.db.forOrg(organization, (tx) =>
        tx.issuedDocument.update({
          where: { id: issued.id },
          data: { pdfAttachmentId: other, renderedAt: new Date() },
        }),
      ),
    ).rejects.toThrow(/issued_document_pdf_is_chosen_attachment/);

    const stored = await test.db.forOrg(organization, (tx) =>
      tx.issuedDocument.findUniqueOrThrow({ where: { id: issued.id } }),
    );
    await expect(
      test.db.forOrg(organization, (tx) =>
        tx.issuedDocument.update({
          where: { id: issued.id },
          data: { pdfAttachmentId: stored.pdfFileId, renderedAt: new Date(), renderFailure: "UNPRINTABLE_TEXT" },
        }),
      ),
    ).rejects.toThrow(/issued_document_render_failure/);
  });

  it("keeps what was issued: it can't be changed, and another organization can't see it", async () => {
    const issued = await test.db.forOrg(organizationId, (tx) => issueDocument(tx, owner, { ...quotation }));
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        tx.issuedDocument.update({ where: { id: issued.id }, data: { title: "Changed" } }),
      ),
    ).rejects.toThrow(/permission denied/i);
    expect(await test.db.forOrg(organizationId, (tx) => getIssuedDocument(tx, { documentId: issued.id }))).toEqual(
      issued,
    );
    const other = await createOrganization(test);
    await expect(test.db.forOrg(other, (tx) => getIssuedDocument(tx, { documentId: issued.id }))).rejects.toMatchObject(
      { code: "NOT_FOUND", reason: "DOCUMENT_NOT_FOUND" },
    );
  });
});
