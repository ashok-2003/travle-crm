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
    // A procedure that does not exist answers NOT_FOUND, whoever asks and whatever they send.
    expect(
      await refusal(procedures.setPaymentDetails?.({ packageId: id, paymentDetails: "UPI x" }) ?? Promise.resolve()),
    ).toBe("NOT_FOUND");
    expect(await refusal(procedures.requestPaymentQrUpload?.(qr) ?? Promise.resolve())).toBe("NOT_FOUND");
    expect(await refusal(procedures.confirmPaymentQr?.(ref) ?? Promise.resolve())).toBe("NOT_FOUND");
    expect(await refusal(procedures.removePaymentQr?.(ref) ?? Promise.resolve())).toBe("NOT_FOUND");
  });

  it("refuses a QR sent through the brochure procedures, and keeps brochures with the editor", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { id } = await harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.create({ data: { name: "Spiti", title: "Spiti", kind: "group" }, select: { id: true } }),
    );
    // Stand-in file service: it lists nothing and hands out an upload slot, so a brochure request can succeed.
    const attachmentId = randomUUID();
    const files = {
      list: () => Promise.resolve([]),
      requestUpload: () =>
        Promise.resolve({
          attachment: { id: attachmentId },
          upload: { url: "https://files.example.test/put", method: "PUT", headers: {}, expiresAt: new Date() },
        }),
    };
    const { caller } = callerOf(harness, { organizationId, granted: ["quotes:edit"], context: { files } as never });
    const request = { packageId: id, fileName: "qr.png", contentType: "image/png", sizeBytes: 100 };
    expect(await refusal(caller.packages.requestFileUpload({ ...request, kind: "payment_qr" } as never))).toBe(
      "BAD_REQUEST",
    );
    expect(await caller.packages.requestFileUpload({ ...request, kind: "brochure" } as never)).toMatchObject({
      attachmentId,
    });
  });
});
