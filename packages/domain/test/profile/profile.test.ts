// An organization's business profile (spec 7.1): saved whole in its own organization, the changed fields recorded by
// name and never by value. The setup checklist read from it is in setup-checklist.test.ts.
import {
  saveBrandingInput,
  saveOrganizationProfileInput,
  updateOrganizationProfileInput,
} from "@travel-crm/contracts/profile";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Actor } from "../../src/kernel/index.js";
import {
  getOrganizationProfile,
  saveOrganizationBranding,
  saveOrganizationProfile,
  updateOrganizationProfile,
} from "../../src/profile/index.js";

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
    expect(await db.forOrg(owner.organizationId, (tx) => getOrganizationProfile(tx, owner.organizationId))).toBeNull();
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

  it("keeps each organization's profile to itself, however it is read, and never deletes one for the api", async () => {
    const owner = await ownerOfNewOrganization();
    const named = { ...details, legalName: "Named Trails LLP" };
    await db.forOrg(owner.organizationId, (tx) => saveOrganizationProfile(tx, owner, named));
    const other = await ownerOfNewOrganization();
    expect(await db.forOrg(other.organizationId, (tx) => getOrganizationProfile(tx, other.organizationId))).toBeNull();
    // The platform role sees every organization's profile: the read names the one it means.
    const asPlatform = (organizationId: string) =>
      platform.$transaction((tx) => getOrganizationProfile(tx, organizationId));
    expect(await asPlatform(owner.organizationId)).toMatchObject({ legalName: "Named Trails LLP" });
    expect(await asPlatform(other.organizationId)).toBeNull();
    await expect(db.forOrg(owner.organizationId, (tx) => tx.organizationProfile.deleteMany({}))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("keeps the branding when the business details are updated, and the details when the branding is", async () => {
    const owner = await ownerOfNewOrganization();
    // The strict business input has no branding keys.
    const businessInput = updateOrganizationProfileInput.parse(
      Object.fromEntries(Object.entries(details).filter(([key]) => key !== "brandColour" && key !== "documentTerms")),
    );
    // Branding needs a profile to hang on.
    await expect(
      db.forOrg(owner.organizationId, (tx) =>
        saveOrganizationBranding(tx, owner, saveBrandingInput.parse({ brandColour: "#1f6f5c", documentTerms: "" })),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", reason: "PROFILE_NOT_SAVED" });
    await db.forOrg(owner.organizationId, (tx) => updateOrganizationProfile(tx, owner, businessInput));
    await db.forOrg(owner.organizationId, (tx) =>
      saveOrganizationBranding(tx, owner, saveBrandingInput.parse({ brandColour: "#1F6F5C", documentTerms: "" })),
    );
    const afterUpdate = await db.forOrg(owner.organizationId, (tx) =>
      updateOrganizationProfile(tx, owner, { ...businessInput, address: "Fort Kochi" }),
    );
    expect(afterUpdate).toMatchObject({ address: "Fort Kochi", brandColour: "#1f6f5c", documentTerms: null });
    const entries = await db.forOrg(owner.organizationId, (tx) => tx.auditEntry.findMany({ orderBy: { id: "asc" } }));
    expect(entries.map((entry) => entry.after)).toEqual([
      { fields: Object.keys(businessInput) },
      { fields: ["brandColour"] },
      { fields: ["address"] },
    ]);
  });

  it("moves the profile's last change on with a branding save, as with any other", async () => {
    const owner = await ownerOfNewOrganization();
    const saved = await db.forOrg(owner.organizationId, (tx) => saveOrganizationProfile(tx, owner, details));
    // Saved a moment earlier than now, so the database's clock can't give the branding save the same instant.
    const earlier = new Date(Date.parse(saved.updatedAt) - 60_000);
    await db.forOrg(owner.organizationId, (tx) =>
      tx.organizationProfile.update({ where: { organizationId: owner.organizationId }, data: { updatedAt: earlier } }),
    );
    const branded = await db.forOrg(owner.organizationId, (tx) =>
      saveOrganizationBranding(tx, owner, saveBrandingInput.parse({ brandColour: "#1f6f5c", documentTerms: "" })),
    );
    expect(Date.parse(branded.updatedAt)).toBeGreaterThan(earlier.getTime());
  });

  it("serialises two saves at once: the second sees the first's row, so only one records the first save", async () => {
    // Both read "no profile" before either writes unless the saves take turns.
    for (let trial = 0; trial < 5; trial++) {
      const owner = await ownerOfNewOrganization();
      await Promise.all([
        db.forOrg(owner.organizationId, (tx) => saveOrganizationProfile(tx, owner, details)),
        db.forOrg(owner.organizationId, (tx) => saveOrganizationProfile(tx, owner, details)),
      ]);
      const entries = await db.forOrg(owner.organizationId, (tx) => tx.auditEntry.findMany());
      expect(entries, `trial ${String(trial)}`).toHaveLength(1);
    }
  });
});
