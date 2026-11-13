// A package's own payment text and QR are gone: payment details are the agency's. Brochures stay the editor's, and a QR
// sent through the brochure procedures is refused.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("packages: no payment procedures", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  it("the package payment procedures are gone", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { id } = await harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.create({ data: { name: "Spiti", title: "Spiti", kind: "group" }, select: { id: true } }),
    );
    const { caller } = callerOf(harness, { organizationId });
    const procedures = caller.packages as unknown as Record<string, (input: unknown) => Promise<unknown>>;
    const qr = { packageId: id, fileName: "qr.png", contentType: "image/png", sizeBytes: 100 };
    const ref = { packageId: id, attachmentId: randomUUID() };
    // A procedure that does not exist is a call that fails, whoever asks and whatever they send.
    await expect(procedures.setPaymentDetails?.({ packageId: id, paymentDetails: "UPI x" })).rejects.toThrow();
    await expect(procedures.requestPaymentQrUpload?.(qr)).rejects.toThrow();
    await expect(procedures.confirmPaymentQr?.(ref)).rejects.toThrow();
    await expect(procedures.removePaymentQr?.(ref)).rejects.toThrow();
  });

  it("refuses a QR sent through the brochure procedures, and keeps brochures with the editor", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { id } = await harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.create({ data: { name: "Spiti", title: "Spiti", kind: "group" }, select: { id: true } }),
    );
    const { caller } = callerOf(harness, { organizationId, granted: ["quotes:edit"] });
    const request = { packageId: id, fileName: "qr.png", contentType: "image/png", sizeBytes: 100 };
    expect(await refusal(caller.packages.requestFileUpload({ ...request, kind: "payment_qr" } as never))).toBe(
      "BAD_REQUEST",
    );
    expect(await refusal(caller.packages.requestFileUpload({ ...request, kind: "brochure" } as never))).not.toBe(
      "MISSING_PERMISSION",
    );
  });
});
