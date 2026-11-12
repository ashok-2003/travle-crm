// The agency's payment details: UPI ID, bank account and QR kept once for the agency. When the agent has somewhere to
// send an advance, the lines it sends, what a save writes and audits (field names only), and the one QR.
import { AGENCY_PAYMENT_QR_RECORD_TYPE, savePaymentDetailsInput } from "@travel-crm/contracts/profile";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFiles, type Files } from "../../src/files/index.js";
import {
  agencyPaymentDetailsOf,
  confirmPaymentQr,
  paymentDetailsReady,
  paymentLinesOf,
  readPaymentDetails,
  removePaymentQr,
  savePaymentDetails,
  type AgencyPaymentDetails,
} from "../../src/profile/index.js";
import { openWorld, type World } from "../bookings/support.js";

const none: AgencyPaymentDetails = {
  upiId: null,
  bankName: null,
  accountName: null,
  accountNumber: null,
  ifsc: null,
  qrAttachmentId: null,
};
const nothing = { upiId: null, bankName: null, accountName: null, accountNumber: null, ifsc: null };
const fullBank = {
  bankName: "Federal Bank",
  accountName: "Kerala Trails LLP",
  accountNumber: "123456789012",
  ifsc: "FDRL0001234",
};

describe("whether the agent can take an advance", () => {
  it("is ready with a UPI ID only, a QR only, or the full bank set", () => {
    expect(paymentDetailsReady({ ...none, upiId: "trails@okbank" })).toBe(true);
    expect(paymentDetailsReady({ ...none, qrAttachmentId: "0199e7a0-0000-7000-8000-000000000001" })).toBe(true);
    expect(paymentDetailsReady({ ...none, ...fullBank })).toBe(true);
  });

  it("is not ready with nothing, a bank name only, or an account number without its IFSC", () => {
    expect(paymentDetailsReady(none)).toBe(false);
    expect(paymentDetailsReady({ ...none, bankName: "Federal Bank" })).toBe(false);
    expect(paymentDetailsReady({ ...none, ...fullBank, ifsc: null })).toBe(false);
  });
});

describe("the lines the agent sends after the advance", () => {
  it("lists only the filled fields, in the order UPI, bank, account name, account number, IFSC", () => {
    expect(paymentLinesOf({ ...none, ...fullBank, upiId: "trails@okbank" })).toEqual([
      "UPI: trails@okbank",
      "Bank: Federal Bank",
      "Account name: Kerala Trails LLP",
      "Account number: 123456789012",
      "IFSC: FDRL0001234",
    ]);
    expect(paymentLinesOf({ ...none, ifsc: "FDRL0001234", upiId: "trails@okbank" })).toEqual([
      "UPI: trails@okbank",
      "IFSC: FDRL0001234",
    ]);
    expect(paymentLinesOf(none)).toEqual([]);
  });
});

describe("what a save accepts", () => {
  const blank = nothing;

  it("checks the UPI ID, the IFSC and the account number, and reads a blank box as no value", () => {
    expect(savePaymentDetailsInput.safeParse({ ...blank, upiId: "no-at-sign" }).success).toBe(false);
    expect(savePaymentDetailsInput.safeParse({ ...blank, ifsc: "FDRL1001234" }).success).toBe(false);
    expect(savePaymentDetailsInput.safeParse({ ...blank, accountNumber: "12ab" }).success).toBe(false);
    expect(savePaymentDetailsInput.safeParse({ ...blank, other: 1 }).success).toBe(false);
    expect(savePaymentDetailsInput.parse({ ...blank, upiId: " ", ifsc: "fdrl0001234" })).toEqual({
      ...blank,
      ifsc: "FDRL0001234",
    });
  });
});

describe("an agency's payment details", () => {
  let world: World;
  let files: Files;
  const storage = createMemoryStorage();

  beforeAll(async () => {
    world = await openWorld("Payment details agency");
    files = createFiles({ db: world.db, storage });
    await world.inOrg((tx) =>
      tx.organizationProfile.create({ data: { legalName: "Kerala Trails LLP", gstStateCode: "32" } }),
    );
  });
  afterAll(async () => {
    await world.close();
  });

  const save = (input: Parameters<typeof savePaymentDetails>[2]) =>
    world.inOrg((tx) => savePaymentDetails(tx, world.manager, input));

  it("writes the profile's columns and audits the names of the fields that changed, never their values", async () => {
    await save({ upiId: "trails@okbank", ...fullBank });
    const row = await world.inOrg((tx) =>
      tx.organizationProfile.findUniqueOrThrow({ where: { organizationId: world.organizationId } }),
    );
    expect(row).toMatchObject({
      upiId: "trails@okbank",
      bankName: "Federal Bank",
      bankAccountName: "Kerala Trails LLP",
      bankAccountNumber: "123456789012",
      bankIfsc: "FDRL0001234",
    });
    const read = await world.inOrg((tx) => agencyPaymentDetailsOf(tx, world.organizationId));
    expect(read).toEqual({ ...none, ...fullBank, upiId: "trails@okbank" });

    await save({ upiId: "new@okbank", ...fullBank });
    const audits = await world.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { action: "profile.payment-details-changed" }, orderBy: { id: "asc" } }),
    );
    expect(audits.map((entry) => entry.after)).toEqual([
      { changed: ["upiId", "bankName", "accountName", "accountNumber", "ifsc"] },
      { changed: ["upiId"] },
    ]);
    expect(JSON.stringify(audits)).not.toContain("123456789012");
  });

  it("records nothing when the same values are saved again", async () => {
    const before = await world.inOrg((tx) =>
      tx.auditEntry.count({ where: { action: "profile.payment-details-changed" } }),
    );
    await save({ upiId: "new@okbank", ...fullBank });
    const after = await world.inOrg((tx) =>
      tx.auditEntry.count({ where: { action: "profile.payment-details-changed" } }),
    );
    expect(after).toBe(before);
  });

  it("keeps one QR: a confirmed one replaces the older, and removing it leaves the other details", async () => {
    const dependencies = { db: world.db, files };
    const record = { recordType: AGENCY_PAYMENT_QR_RECORD_TYPE, recordId: world.organizationId };
    async function arrived(name: string): Promise<string> {
      const { attachment, upload } = await files.requestUpload(world.manager, {
        ...record,
        fileName: name,
        contentType: "image/png",
        sizeBytes: 8,
        sensitive: false,
      });
      await storage.upload(upload, new TextEncoder().encode("12345678"), "image/png");
      return attachment.id;
    }
    const first = await arrived("first.png");
    await confirmPaymentQr(dependencies, world.manager, first);
    const second = await arrived("second.png");
    await confirmPaymentQr(dependencies, world.manager, second);

    const shown = await readPaymentDetails(dependencies, world.manager);
    expect(shown.qr).toMatchObject({ id: second, fileName: "second.png" });
    expect(shown.ready).toBe(true);
    expect((await files.list(world.manager, record)).map((file) => file.id)).toEqual([second]);

    await removePaymentQr(dependencies, world.manager, second);
    const after = await readPaymentDetails(dependencies, world.manager);
    expect(after.qr).toBeNull();
    expect(after.upiId).toBe("new@okbank");
  });

  it("refuses a file that isn't a picture", async () => {
    await expect(
      files.requestUpload(world.manager, {
        recordType: AGENCY_PAYMENT_QR_RECORD_TYPE,
        recordId: world.organizationId,
        fileName: "qr.pdf",
        contentType: "application/pdf",
        sizeBytes: 8,
        sensitive: false,
      }),
    ).rejects.toThrow();
  });

  it("refuses to save before the business profile exists", async () => {
    const other = await openWorld("No profile agency");
    try {
      await expect(
        other.inOrg((tx) => savePaymentDetails(tx, other.manager, { ...nothing, upiId: "a@okbank" })),
      ).rejects.toMatchObject({ reason: "PROFILE_NOT_SAVED" });
    } finally {
      await other.close();
    }
  });
});
