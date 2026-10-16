// How many documents an organization issued since a day: a usage counter for the platform dashboard (spec 7.4). The
// branding's samples are previews, not use.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { documentsIssuedSince, issueDocument, SAMPLE_PREFIX } from "../../src/documents/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { createOrganization, createTestDocuments, quotation, type TestDocuments } from "./test-documents.js";

describe("documents issued", () => {
  let test: TestDocuments;

  beforeAll(() => {
    test = createTestDocuments();
  });

  afterAll(async () => {
    await test.close();
  });

  it("counts the organization's documents issued since a day, and only its own", async () => {
    const organizationId = await createOrganization(test);
    const other = await createOrganization(test);
    for (const issuer of [organizationId, organizationId, other]) {
      await test.db.forOrg(issuer, (tx) => issueDocument(tx, systemActor(issuer), { ...quotation }));
    }
    const lastMinute = new Date(Date.now() - 60_000);
    expect(await test.db.forOrg(organizationId, (tx) => documentsIssuedSince(tx, lastMinute))).toBe(2);
    expect(await test.db.forOrg(organizationId, (tx) => documentsIssuedSince(tx, new Date(Date.now() + 60_000)))).toBe(
      0,
    );
  });

  it("leaves out the branding's samples", async () => {
    const organizationId = await createOrganization(test);
    const actor = systemActor(organizationId);
    await test.db.forOrg(organizationId, async (tx) => {
      await issueDocument(tx, actor, { ...quotation, prefix: SAMPLE_PREFIX });
      await issueDocument(tx, actor, { ...quotation });
    });
    const lastMinute = new Date(Date.now() - 60_000);
    expect(await test.db.forOrg(organizationId, (tx) => documentsIssuedSince(tx, lastMinute))).toBe(1);
  });

  it("refuses to count as the platform role, which would count every organization's", async () => {
    await expect(test.platform.$transaction((tx) => documentsIssuedSince(tx, new Date(0)))).rejects.toThrow(RangeError);
  });
});
