// An organization's business profile (spec 7.1): saved whole in its own organization, the changed fields recorded by
// name and never by value, and the setup checklist read from it.
import { saveOrganizationProfileInput } from "@travel-crm/contracts/profile";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Actor } from "../../src/kernel/index.js";
import { getOrganizationProfile, saveOrganizationProfile, setupChecklistOf } from "../../src/profile/index.js";

const details = saveOrganizationProfileInput.parse({
  legalName: "Kerala Trails LLP",
  gstin: null,
  gstStateCode: "32",
  address: null,
  contactName: "Lakshmi Nair",
  contactPhone: null,
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  bankName: null,
  invoicePrefix: null,
  brandColour: null,
  documentTerms: null,
});

describe("the business profile", () => {
  let platform: PlatformClient;
  let db: Database;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  async function ownerOfNewOrganization(): Promise<Actor> {
    const organizationId = await createTestOrganization(platform, "Profiled");
    return { organizationId, userId: "0199e7a0-0000-7000-8000-00000000b0a1", source: "web", impersonatedBy: null };
  }

  it("saves the profile, then changes it, recording the changed fields by name only", async () => {
    const owner = await ownerOfNewOrganization();
    expect(await db.forOrg(owner.organizationId, getOrganizationProfile)).toBeNull();
    await db.forOrg(owner.organizationId, (tx) => saveOrganizationProfile(tx, owner, details));
    const saved = await db.forOrg(owner.organizationId, (tx) =>
      saveOrganizationProfile(tx, owner, { ...details, bankAccountNumber: "001234567890", bankIfsc: "HDFC0001234" }),
    );
    expect(saved).toMatchObject({ legalName: "Kerala Trails LLP", gstStateCode: "32", bankIfsc: "HDFC0001234" });
    // The same values again record nothing.
    await db.forOrg(owner.organizationId, (tx) =>
      saveOrganizationProfile(tx, owner, { ...details, bankAccountNumber: "001234567890", bankIfsc: "HDFC0001234" }),
    );
    const entries = await db.forOrg(owner.organizationId, (tx) => tx.auditEntry.findMany({ orderBy: { id: "asc" } }));
    expect(entries.map((entry) => entry.after)).toEqual([
      { fields: Object.keys(details) },
      { fields: ["bankAccountNumber", "bankIfsc"] },
    ]);
    expect(JSON.stringify(entries)).not.toContain("001234567890");
  });

  it("keeps each organization's profile to itself, and never deletes one for the api", async () => {
    const owner = await ownerOfNewOrganization();
    await db.forOrg(owner.organizationId, (tx) => saveOrganizationProfile(tx, owner, details));
    const other = await ownerOfNewOrganization();
    expect(await db.forOrg(other.organizationId, getOrganizationProfile)).toBeNull();
    await expect(db.forOrg(owner.organizationId, (tx) => tx.organizationProfile.deleteMany({}))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("lists the setup steps done and to do", () => {
    const empty = setupChecklistOf(null, 1);
    expect(empty).toEqual({
      steps: [
        { step: "business-details", done: false },
        { step: "bank-details", done: false },
        { step: "invoice-prefix", done: false },
        { step: "branding", done: false },
        { step: "staff", done: false },
      ],
      done: false,
    });
    const complete = setupChecklistOf(
      {
        ...details,
        address: "Fort Kochi",
        contactPhone: "+919876543210",
        bankAccountNumber: "001234567890",
        bankIfsc: "HDFC0001234",
        invoicePrefix: "KT",
        documentTerms: "Payment due on booking.",
        updatedAt: new Date().toISOString(),
      },
      3,
    );
    expect(complete.done).toBe(true);
  });
});
