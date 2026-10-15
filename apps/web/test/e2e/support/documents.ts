// What the documents journeys start from: the agency's business details saved, as its Owner saves them on the
// profile screen (branding and documents need them), and a logo to upload.
import { expect, type Page } from "@playwright/test";

const businessDetails = {
  legalName: "Sharma Travels Private Limited",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "14 Marine Drive, Mumbai 400002",
  contactName: "Asha Sharma",
  contactPhone: "+91 98765 43210",
  bankAccountName: "Sharma Travels Private Limited",
  bankAccountNumber: "001234567890",
  bankIfsc: "HDFC0001234",
  bankName: "HDFC Bank",
  invoicePrefix: "ST",
};

/** Saves the business details through the api as the signed-in Owner, as the profile screen does. */
export async function saveBusinessProfile(page: Page): Promise<void> {
  const origin = process.env.E2E_BASE_URL;
  if (!origin) throw new Error("E2E_BASE_URL is not set: run the journeys with `pnpm --filter @travel-crm/web e2e`");
  // The api accepts changes only from the web app's own origin, which a browser would send.
  const response = await page.request.post("/api/trpc/organization.profile.update", {
    data: businessDetails,
    headers: { origin },
  });
  expect(response.ok()).toBe(true);
}

/** A 1x1 PNG: the smallest logo a browser draws. */
export const logoPng = {
  name: "Sharma Travels.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
};
