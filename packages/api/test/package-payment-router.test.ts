// Where customers pay (a package's payment details and QR) is held by whoever manages settings, read from the database;
// a member who may only edit packages (the Sales role) is refused, the brochures stay theirs.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("packages: where customers pay", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  async function aPackage(organizationId: string) {
    return harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.create({ data: { name: "Spiti", title: "Spiti", kind: "group" }, select: { id: true } }),
    );
  }
  const qrRequest = (packageId: string) => ({
    packageId,
    fileName: "qr.png",
    contentType: "image/png" as const,
    sizeBytes: 100,
  });

  it("refuses the payment details and the QR to a member who may only edit packages", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { id } = await aPackage(organizationId);
    const { caller } = callerOf(harness, { organizationId, granted: ["quotes:edit"] });
    expect(await refusal(caller.packages.setPaymentDetails({ packageId: id, paymentDetails: "UPI x" }))).toBe(
      "MISSING_PERMISSION",
    );
    expect(await refusal(caller.packages.requestPaymentQrUpload(qrRequest(id)))).toBe("MISSING_PERMISSION");
    const ref = { packageId: id, attachmentId: randomUUID() };
    expect(await refusal(caller.packages.confirmPaymentQr(ref))).toBe("MISSING_PERMISSION");
    expect(await refusal(caller.packages.removePaymentQr(ref))).toBe("MISSING_PERMISSION");
  });

  it("refuses a QR sent through the brochure procedures, and keeps brochures with the editor", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { id } = await aPackage(organizationId);
    const { caller } = callerOf(harness, { organizationId, granted: ["quotes:edit"] });
    const asQr = { ...qrRequest(id), kind: "payment_qr" } as never;
    expect(await refusal(caller.packages.requestFileUpload(asQr))).toBe("BAD_REQUEST");
    const brochure = { ...qrRequest(id), kind: "brochure" } as never;
    expect(await refusal(caller.packages.requestFileUpload(brochure))).not.toBe("MISSING_PERMISSION");
  });

  it("lets an owner change the payment details", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { id } = await aPackage(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    await caller.packages.setPaymentDetails({ packageId: id, paymentDetails: "UPI spiti@bank" });
    const row = await harness.db.forOrg(organizationId, (tx) =>
      tx.quoteTemplate.findUniqueOrThrow({ where: { id }, select: { paymentDetails: true } }),
    );
    expect(row.paymentDetails).toBe("UPI spiti@bank");
  });
});
