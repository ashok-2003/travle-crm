// The organization's issued documents for its documents screen: newest first, a page at a time, each saying whether
// its PDF is ready, being prepared or can never be made, and never another organization's.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueDocument, listIssuedDocuments } from "../../src/documents/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { createOrganization, createTestDocuments, quotation, type TestDocuments } from "./test-documents.js";

describe("listIssuedDocuments", () => {
  let test: TestDocuments;

  beforeAll(() => {
    test = createTestDocuments();
  });

  afterAll(async () => {
    await test.close();
  });

  /** Issues a document a minute after the one before, as people do. */
  const issuedAt = (minute: number) => new Date(Date.UTC(2026, 9, 15, 6, minute));

  async function issued(organizationId: string, minute: number) {
    return test.db.forOrg(organizationId, (tx) =>
      issueDocument(tx, systemActor(organizationId), { ...quotation }, issuedAt(minute)),
    );
  }

  it("lists the newest first, a page at a time", async () => {
    const organizationId = await createOrganization(test);
    const documents = [
      await issued(organizationId, 1),
      await issued(organizationId, 2),
      await issued(organizationId, 3),
    ];
    const list = (input: { cursor?: string; limit?: number }) =>
      test.db.forOrg(organizationId, (tx) => listIssuedDocuments(tx, input));

    const first = await list({ limit: 2 });
    expect(first.documents.map((document) => document.number)).toEqual(["DOC-2026-0003", "DOC-2026-0002"]);
    expect(first.nextCursor).toBe(documents[1]?.id);
    if (first.nextCursor === null) throw new Error("a second page was expected");
    const second = await list({ limit: 2, cursor: first.nextCursor });
    expect(second).toEqual({ documents: [documents[0]], nextCursor: null });
    expect((await list({})).documents).toHaveLength(3);
  });

  it("says which PDFs can never be made", async () => {
    const organizationId = await createOrganization(test);
    const document = await issued(organizationId, 1);
    await test.db.forOrg(organizationId, (tx) =>
      tx.issuedDocument.update({ where: { id: document.id }, data: { renderFailure: "UNPRINTABLE_TEXT: U+0939" } }),
    );
    const { documents } = await test.db.forOrg(organizationId, (tx) => listIssuedDocuments(tx, {}));
    expect(documents).toMatchObject([{ id: document.id, pdfAttachmentId: null, renderFailed: true }]);
  });

  it("shows nothing of another organization's, not even through its cursor", async () => {
    const organizationId = await createOrganization(test);
    const other = await createOrganization(test);
    const theirs = await issued(other, 1);
    await issued(organizationId, 2);
    const list = (cursor?: string) =>
      test.db.forOrg(organizationId, (tx) => listIssuedDocuments(tx, cursor === undefined ? {} : { cursor }));
    expect((await list()).documents.map((document) => document.id)).not.toContain(theirs.id);
    expect(await list(theirs.id)).toEqual({ documents: [], nextCursor: null });
  });

  it("refuses a page it can't read", async () => {
    const organizationId = await createOrganization(test);
    for (const input of [{ limit: 0 }, { limit: 51 }, { cursor: "page-2" }]) {
      await expect(
        test.db.forOrg(organizationId, (tx) => listIssuedDocuments(tx, input)),
        JSON.stringify(input),
      ).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_PAGE" });
    }
  });
});
