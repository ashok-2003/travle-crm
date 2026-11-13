// organization.paymentDetails: bank details and the payment QR belong to whoever manages settings, read from the
// database; a member without settings:manage is refused every call, and a QR must be a picture.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("organization.paymentDetails", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  const input = { upiId: "trails@okbank", bankName: null, accountName: null, accountNumber: null, ifsc: null };
  const qr = { fileName: "qr.png", contentType: "image/png" as const, sizeBytes: 100 };

  it("refuses a member without settings:manage every call", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId, granted: ["quotes:edit"] });
    const paymentDetails = caller.organization.paymentDetails;
    const ref = { attachmentId: randomUUID() };
    expect(await refusal(paymentDetails.get())).toBe("MISSING_PERMISSION");
    expect(await refusal(paymentDetails.save(input))).toBe("MISSING_PERMISSION");
    expect(await refusal(paymentDetails.requestQrUpload(qr))).toBe("MISSING_PERMISSION");
    expect(await refusal(paymentDetails.confirmQr(ref))).toBe("MISSING_PERMISSION");
    expect(await refusal(paymentDetails.removeQr(ref))).toBe("MISSING_PERMISSION");
  });

  it("refuses a QR that isn't a picture, and a value that isn't a UPI ID", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId });
    const pdf = { ...qr, contentType: "application/pdf" } as never;
    expect(await refusal(caller.organization.paymentDetails.requestQrUpload(pdf))).toBe("BAD_REQUEST");
    expect(await refusal(caller.organization.paymentDetails.save({ ...input, upiId: "nope" }))).toBe("BAD_REQUEST");
  });

  it("lets an owner save the details and read them back, not ready until the payment QR is added", async () => {
    const organizationId = await anAgency(harness);
    await harness.db.forOrg(organizationId, (tx) =>
      tx.organizationProfile.create({ data: { legalName: "Kerala Trails LLP", gstStateCode: "32" } }),
    );
    const { caller } = callerOf(harness, { organizationId });
    expect((await caller.organization.paymentDetails.get()).ready).toBe(false);
    const saved = await caller.organization.paymentDetails.save(input);
    // The agent asks for payment only with the agency's payment QR; a UPI ID alone is an extra (owner, 2026-11-13).
    expect(saved).toMatchObject({ upiId: "trails@okbank", qr: null, ready: false });
    expect(await caller.organization.paymentDetails.get()).toEqual(saved);
  });
});
