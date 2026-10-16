// What the documents journeys start from: the agency's business details saved, as its Owner saves them on the
// profile screen (branding and documents need them), a logo to upload, and a sample quotation the worker has rendered.
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

/** The web app's address: the api accepts changes only from its own origin, which a browser would send. */
function appOrigin(): string {
  const origin = process.env.E2E_BASE_URL;
  if (!origin) throw new Error("E2E_BASE_URL is not set: run the journeys with `pnpm --filter @travel-crm/web e2e`");
  return origin;
}

/** Saves the business details through the api as the signed-in Owner, as the profile screen does. */
export async function saveBusinessProfile(page: Page): Promise<void> {
  const response = await page.request.post("/api/trpc/organization.profile.update", {
    data: businessDetails,
    headers: { origin: appOrigin() },
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

interface Answered<T> {
  result: { data: T };
}

/** Issues a sample quotation through the api as the signed-in Owner, and waits until the worker has rendered it. */
export async function renderedSample(page: Page): Promise<{ id: string; number: string }> {
  const issued = await page.request.post("/api/trpc/documents.issueSample", {
    data: {},
    headers: { origin: appOrigin() },
  });
  expect(issued.ok()).toBe(true);
  const { id, number } = ((await issued.json()) as Answered<{ id: string; number: string }>).result.data;
  const input = encodeURIComponent(JSON.stringify({ documentId: id }));
  const pdfOf = async () => {
    const answer = await page.request.get(`/api/trpc/documents.get?input=${input}`);
    return ((await answer.json()) as Answered<{ pdfAttachmentId: string | null }>).result.data.pdfAttachmentId;
  };
  // The worker renders it in the background, within seconds.
  await expect.poll(pdfOf, { timeout: 20_000 }).not.toBeNull();
  return { id, number };
}
