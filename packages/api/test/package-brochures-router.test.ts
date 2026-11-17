// packages.describeFile: a package editor names and describes a brochure; a member without quotes:edit is refused.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("packages.describeFile", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  it("lets a package editor describe a brochure and refuses everyone else", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { id } = await harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.create({ data: { name: "Spiti", title: "Spiti", kind: "group" }, select: { id: true } }),
    );
    const attachmentId = randomUUID();
    await harness.db.forOrg(organizationId, (tx) =>
      tx.attachment.create({
        data: {
          id: attachmentId,
          recordType: "package_brochure",
          recordId: id,
          fileName: "spiti.pdf",
          contentType: "application/pdf",
          sizeBytes: 8,
          status: "ready",
          confirmedAt: new Date(),
          sensitive: false,
        },
      }),
    );
    const input = { packageId: id, attachmentId, name: " Spiti\n7 nights ", description: "Day by day" };

    const outsider = callerOf(harness, { organizationId, granted: [] }).caller;
    expect(await refusal(outsider.packages.describeFile(input))).toBe("MISSING_PERMISSION");

    const { caller } = callerOf(harness, { organizationId, granted: ["quotes:edit"] });
    await caller.packages.describeFile(input);
    const saved = await harness.db.forOrg(organizationId, (tx) => tx.packageBrochure.findMany());
    expect(saved).toMatchObject([{ packageId: id, attachmentId, name: "Spiti 7 nights", description: "Day by day" }]);

    expect(await refusal(caller.packages.describeFile({ ...input, attachmentId: randomUUID() }))).toBe(
      "BROCHURE_NOT_FOUND",
    );
    expect(await refusal(caller.packages.describeFile({ ...input, name: "x".repeat(81) }))).toBe("BAD_REQUEST");
  });
});
