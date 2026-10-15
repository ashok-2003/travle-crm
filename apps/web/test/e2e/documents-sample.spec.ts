// A sample quotation (spec 9.3): an Owner previews their branding on one, the worker renders its PDF, and the PDF
// downloads from storage, from the branding screen and from the documents screen, which lists it as ready.
import { readFile } from "node:fs/promises";
import type { Download } from "@playwright/test";
import { saveBusinessProfile } from "./support/documents";
import { expect, signInByEmail, test } from "./support/fixtures";

/** The downloaded file's name and its first bytes. */
async function downloaded(download: Download): Promise<{ name: string; start: string }> {
  const file = await download.path();
  return { name: download.suggestedFilename(), start: (await readFile(file)).subarray(0, 5).toString("latin1") };
}

test("an Owner previews a sample quotation, and downloads its PDF once the worker has made it", async ({
  page,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await page.goto("/settings/branding");
  await page.getByRole("button", { name: "Preview on a sample quotation" }).click();
  await expect(page.getByText(/^SMPL-\d{4}-0001 is being prepared/)).toBeVisible();
  // The worker renders it in the background; the screen asks again until it has.
  await expect(page.getByText(/^SMPL-\d{4}-0001 is ready/)).toBeVisible({ timeout: 20_000 });

  const fromBranding = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the PDF" }).click();
  const sample = await downloaded(await fromBranding);
  expect(sample.name).toMatch(/^SMPL-\d{4}-0001\.pdf$/);
  expect(sample.start).toBe("%PDF-");

  await page.getByRole("link", { name: "All documents" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Documents" })).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  const fromList = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Download SMPL-\d{4}-0001 as a PDF$/ }).click();
  expect((await downloaded(await fromList)).start).toBe("%PDF-");
});
