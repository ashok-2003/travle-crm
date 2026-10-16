// The branding's samples an organization may issue: SAMPLES_PER_DAY in any 24 hours, as each is kept for good with
// its PDF. Real documents and other organizations' samples don't count.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertMayIssueSample, issueDocument, SAMPLE_PREFIX, SAMPLES_PER_DAY } from "../../src/documents/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { createOrganization, createTestDocuments, quotation, type TestDocuments } from "./test-documents.js";

describe("the samples' limit", () => {
  let test: TestDocuments;

  beforeAll(() => {
    test = createTestDocuments();
  });

  afterAll(async () => {
    await test.close();
  });

  it("refuses another sample once the day's are issued, and allows one again a day later", async () => {
    const organizationId = await createOrganization(test);
    const actor = systemActor(organizationId);
    const mayIssue = (now?: Date) => test.db.forOrg(organizationId, (tx) => assertMayIssueSample(tx, now));
    const sample = () =>
      test.db.forOrg(organizationId, (tx) => issueDocument(tx, actor, { ...quotation, prefix: SAMPLE_PREFIX }));
    await test.db.forOrg(organizationId, async (tx) => {
      for (let count = 1; count < SAMPLES_PER_DAY; count++) {
        await issueDocument(tx, actor, { ...quotation, prefix: SAMPLE_PREFIX });
      }
      await issueDocument(tx, actor, quotation);
    });
    await expect(mayIssue()).resolves.toBeUndefined();

    await sample();
    await expect(mayIssue()).rejects.toMatchObject({ code: "LIMIT_REACHED", reason: "SAMPLE_LIMIT_REACHED" });
    await expect(mayIssue(new Date(Date.now() + 24 * 60 * 60 * 1000 + 60_000))).resolves.toBeUndefined();
    const other = await createOrganization(test);
    await expect(test.db.forOrg(other, (tx) => assertMayIssueSample(tx))).resolves.toBeUndefined();
  });
});
