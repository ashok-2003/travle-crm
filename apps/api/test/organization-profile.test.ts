// The organization's business profile and setup checklist over HTTP (spec 7.1): the Owner completes what onboarding
// left out and the checklist follows; staff without settings:manage neither see the bank details nor change them;
// a read-only organization's Owner may look but not save.
import type { OrganizationProfileDetails, SetupChecklist } from "@travel-crm/contracts/profile";
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
  brandColour: "#1F6F5C",
  documentTerms: null,
};

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
    expect(await dataOf(await query(server, "profile.get", jar))).toBeNull();
    expect((await dataOf<SetupChecklist>(await query(server, "profile.checklist", jar))).done).toBe(false);

    const saved = await dataOf<OrganizationProfileDetails>(await mutate(server, "profile.save", profile, jar));
    expect(saved).toMatchObject({ gstin: "27AAPFU0939F1ZV", bankIfsc: "HDFC0001234", invoicePrefix: "KT" });
    expect(await dataOf(await query(server, "profile.get", jar))).toEqual(saved);
    expect(await dataOf<SetupChecklist>(await query(server, "profile.checklist", jar))).toEqual({
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

  it("refuses staff without settings:manage", async () => {
    const agency = await createTestAgency(server);
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, sales);
    expect(await refusalOf(await query(server, "profile.get", jar))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    expect(await refusalOf(await mutate(server, "profile.save", profile, jar))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
  });

  it("lets a read-only organization's Owner look, but not save", async () => {
    const agency = await createTestAgency(server);
    const jar = await signedInOwner(server, agency);
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    expect((await query(server, "profile.get", jar)).status).toBe(200);
    expect(await refusalOf(await mutate(server, "profile.save", profile, jar))).toEqual({
      status: 403,
      reason: "ORGANIZATION_READ_ONLY",
    });
  });
});
