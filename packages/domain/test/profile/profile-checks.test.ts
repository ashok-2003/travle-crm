// The business profile's CHECK constraints, hit directly with rows that skip the contracts: the database refuses a bad
// value whoever writes it. The state-code test also keeps the database's list the same as the kernel's, and the
// reserved-prefix test the same as the contracts'.
import { reservedDocumentPrefixes } from "@travel-crm/contracts/documents";
import { gstStates, isGstStateCode } from "@travel-crm/contracts/kernel";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const valid = { legalName: "Check Travels", gstStateCode: "27", gstin: "27AAPFU0939F1ZV" };

describe("the business profile's database checks", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Checked");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  // Every attempt is its own transaction, rolled back when the database refuses (or by the sentinel when it accepts).
  async function insert(data: Record<string, string | null>): Promise<string> {
    const rolledBack = new Error("rolled back");
    try {
      await db.forOrg(organizationId, async (tx) => {
        await tx.organizationProfile.create({ data: { ...valid, ...data } });
        throw rolledBack;
      });
    } catch (error) {
      if (error === rolledBack) return "accepted";
      return (error as Error).message;
    }
    return "accepted";
  }

  it("accepts a valid row", async () => {
    expect(await insert({})).toBe("accepted");
  });

  it.each([
    ["legal_name_length", { legalName: "" }],
    ["legal_name_length", { legalName: "x".repeat(121) }],
    ["gstin_format", { gstin: "27aapfu0939f1zv" }],
    ["gstin_format", { gstin: "27AAPFU0939F1" }],
    // A well-formed GSTIN of another state than the profile's.
    ["gstin_format", { gstin: "29AAPFU0939F1ZV" }],
    ["gst_state_code_known", { gstStateCode: "99", gstin: null }],
    ["gst_state_code_known", { gstStateCode: "7", gstin: null }],
    ["address_length", { address: "x".repeat(501) }],
    ["contact_name_length", { contactName: "x".repeat(101) }],
    ["contact_phone_format", { contactPhone: "9876543210" }],
    ["contact_phone_format", { contactPhone: "+0123456789" }],
    ["bank_account_name_length", { bankAccountName: "x".repeat(121) }],
    ["bank_account_number_format", { bankAccountNumber: "12345678" }],
    ["bank_account_number_format", { bankAccountNumber: "0012 3456 7890" }],
    ["bank_ifsc_format", { bankIfsc: "HDFC1001234" }],
    ["bank_ifsc_format", { bankIfsc: "hdfc0001234" }],
    ["bank_name_length", { bankName: "x".repeat(121) }],
    ["invoice_prefix_format", { invoicePrefix: "S" }],
    ["invoice_prefix_format", { invoicePrefix: "sh" }],
    ["invoice_prefix_format", { invoicePrefix: "SHARMA" }],
    ["brand_colour_format", { brandColour: "#1F6F5C" }],
    ["brand_colour_format", { brandColour: "green" }],
    ["document_terms_length", { documentTerms: "x".repeat(2001) }],
  ] as const)("refuses a bad value (%s): %o", async (constraint, data) => {
    expect(await insert(data)).toContain(`organization_profile_${constraint}`);
  });

  it("knows exactly the states the kernel does", async () => {
    for (let number = 0; number <= 99; number++) {
      const code = String(number).padStart(2, "0");
      const result = await insert({ gstStateCode: code, gstin: null });
      expect(result === "accepted", `state ${code}`).toBe(isGstStateCode(code));
    }
    expect(gstStates.length).toBeGreaterThan(30);
  });

  it("refuses exactly the invoice prefixes the platform numbers its own documents with", async () => {
    for (const invoicePrefix of reservedDocumentPrefixes) {
      expect(await insert({ invoicePrefix }), invoicePrefix).toContain(
        "organization_profile_invoice_prefix_not_reserved",
      );
    }
    for (const invoicePrefix of ["SM", "SMP", "DOCS", "SH"]) {
      expect(await insert({ invoicePrefix }), invoicePrefix).toBe("accepted");
    }
    // Both ways: a prefix the CHECK refuses but the contract allows would pass the form, then fail the save.
    const [check] = await platform.$queryRaw<{ definition: string }[]>`
      SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conname = 'organization_profile_invoice_prefix_not_reserved'`;
    const refused = [...(check?.definition ?? "").matchAll(/'([A-Z]+)'/g)].map(([, prefix]) => prefix);
    expect(refused.sort()).toEqual([...reservedDocumentPrefixes].sort());
  });
});
