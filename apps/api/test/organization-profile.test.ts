// The organization's business profile and setup checklist over HTTP (spec 7.1): the Owner completes what onboarding
// left out and the checklist follows; staff without settings:manage neither see the bank details nor change them;
// a read-only organization's Owner may look but not save.
import type { BrandingDetails, BusinessProfileDetails, SetupChecklist } from "@travel-crm/contracts/profile";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const profile = {
  legalName: "Konkan Trails LLP",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "12 Hill Road, Bandra, Mumbai 400050",
  contactName: "Lakshmi Nair",
  contactPhone: "+91 98200 12345",
  bankAccountName: "Konkan Trails LLP",
  bankAccountNumber: "001234567890",
  bankIfsc: "hdfc0001234",
  bankName: "HDFC Bank",
  invoicePrefix: "kt",
};
const branding = { brandColour: "#1F6F5C", documentTerms: "" };

describe("the organization profile", () => {
  let server: TestServer;

  beforeAll(() => {
    server = createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("lets the Owner complete the profile, and the setup checklist follows", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    expect(await dataOf(await query(server, "organization.profile.get", jar))).toBeNull();
    expect((await dataOf<SetupChecklist>(await query(server, "organization.setup.get", jar))).done).toBe(false);

    const saved = await dataOf<BusinessProfileDetails>(
      await mutate(server, "organization.profile.update", profile, jar),
    );
    expect(saved).toMatchObject({ gstin: "27AAPFU0939F1ZV", bankIfsc: "HDFC0001234", invoicePrefix: "KT" });
    expect(await dataOf(await query(server, "organization.profile.get", jar))).toEqual(saved);
    // Branding hangs on the profile, and is a screen of its own.
    expect(await dataOf(await query(server, "organization.branding.get", jar))).toMatchObject({ brandColour: null });
    const styled = await dataOf<BrandingDetails>(await mutate(server, "organization.branding.update", branding, jar));
    expect(styled).toMatchObject({ brandColour: "#1f6f5c", documentTerms: null });
    expect(await dataOf(await query(server, "organization.branding.get", jar))).toEqual(styled);
    expect(await dataOf<SetupChecklist>(await query(server, "organization.setup.get", jar))).toEqual({
      steps: [
        { step: "business-details", done: true },
        { step: "bank-details", done: true },
        { step: "invoice-prefix", done: true },
        { step: "branding", done: true },
        // Only the Owner so far.
        { step: "staff", done: false },
      ],
      done: false,
    });
  });

  it("keeps the account number out of branding and the checklist, and the branding out of the profile", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    await dataOf(await mutate(server, "organization.profile.update", profile, jar));
    await dataOf(await mutate(server, "organization.branding.update", branding, jar));
    const profileAnswer = JSON.stringify(await dataOf(await query(server, "organization.profile.get", jar)));
    expect(profileAnswer).toContain("001234567890");
    expect(profileAnswer).not.toContain("brandColour");
    for (const path of ["organization.branding.get", "organization.setup.get"]) {
      expect(JSON.stringify(await dataOf(await query(server, path, jar))), path).not.toContain("001234567890");
    }
  });

  it("takes blank boxes as empty, and refuses branding before the business details", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    expect(await refusalOf(await mutate(server, "organization.branding.update", branding, jar))).toEqual({
      status: 409,
      reason: "PROFILE_NOT_SAVED",
    });
    const blank = { ...profile, gstin: "", contactPhone: "", bankAccountNumber: "", bankIfsc: "", invoicePrefix: "" };
    expect(await dataOf(await mutate(server, "organization.profile.update", blank, jar))).toMatchObject({
      gstin: null,
      contactPhone: null,
      invoicePrefix: null,
    });
  });

  it("refuses staff without settings:manage", async () => {
    const agency = await createTestAgency(server);
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, sales);
    expect(await refusalOf(await query(server, "organization.profile.get", jar))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    for (const path of ["organization.branding.get", "organization.setup.get"]) {
      expect(await refusalOf(await query(server, path, jar)), path).toEqual({
        status: 403,
        reason: "MISSING_PERMISSION",
      });
    }
    for (const [path, input] of [
      ["organization.profile.update", profile],
      ["organization.branding.update", branding],
    ] as const) {
      expect(await refusalOf(await mutate(server, path, input, jar)), path).toEqual({
        status: 403,
        reason: "MISSING_PERMISSION",
      });
    }
  });

  it("lets a read-only organization's Owner look, but not save", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    expect((await query(server, "organization.profile.get", jar)).status).toBe(200);
    expect(await refusalOf(await mutate(server, "organization.profile.update", profile, jar))).toEqual({
      status: 403,
      reason: "ORGANIZATION_READ_ONLY",
    });
  });
});
