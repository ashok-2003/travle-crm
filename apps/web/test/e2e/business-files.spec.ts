// Business files (spec 9.2): an Owner uploads a PDF from the browser straight to storage (MinIO, which the
// Content-Security-Policy allows as STORAGE_ORIGIN), sees it listed and downloads it; a sensitive file is only a
// "Sensitive file" to a role without documents:view_sensitive, with nothing it can do to it.
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { addRole } from "./support/business";
import { expect, signInByEmail, test } from "./support/fixtures";
import { signInWithCode } from "./support/sign-in-with-code";

const PDF = Buffer.from("%PDF-1.4\n% A GST registration certificate, as far as storage can tell.\n");

/** Uploads a PDF through the screen, as a person picks it from their files. */
async function uploadPdf(page: Page, name: string, { sensitive = false } = {}): Promise<void> {
  if (sensitive) await page.getByRole("checkbox", { name: "Sensitive" }).check();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload a file" }).click();
  await (await chooser).setFiles({ name, mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByText(`${name} was uploaded`)).toBeVisible();
}

test("an Owner uploads a PDF to storage through the browser, sees it listed and downloads it", async ({
  page,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/settings/files");
  await expect(page.getByRole("heading", { level: 1, name: "Business files" })).toBeVisible();
  await expect(page.getByText("No files yet.", { exact: false })).toBeVisible();
  await expectAccessible(page);

  await uploadPdf(page, "GST certificate.pdf");
  // The screen's own list: a toast is a list item too.
  const row = page.getByRole("main").getByRole("listitem").filter({ hasText: "GST certificate.pdf" });
  await expect(row).toContainText(`PDF · ${String(PDF.byteLength)} bytes · Added`);
  await expectAccessible(page);

  const download = page.waitForEvent("download");
  await row.getByRole("button", { name: "Download GST certificate.pdf" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("GST certificate.pdf");
  expect(await readFile(await file.path())).toEqual(PDF);
});

test("a sensitive file is only a Sensitive file to a role without documents:view_sensitive", async ({
  page,
  browser,
  agency,
  addStaff,
  database,
}) => {
  const roleKey = await addRole(database, agency, { name: "Office manager", permissions: ["settings:manage"] });
  const manager = await addStaff({ name: "Meera Iyer", username: "meera", roleKey });
  await signInByEmail(page, agency.owner);
  await page.goto("/settings/files");
  await uploadPdf(page, "Aadhaar card.pdf", { sensitive: true });
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: "Aadhaar card.pdf" })).toContainText(
    "Sensitive",
  );

  // Meera, on her own device, may manage settings but not open sensitive files.
  const meerasPhone = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "" });
  const meera = await meerasPhone.newPage();
  await signInWithCode(meera.request, {
    orgCode: agency.code,
    username: manager.username,
    password: manager.password,
  });
  await meera.goto("/settings/files");
  const row = meera.getByRole("main").getByRole("listitem").filter({ hasText: "Sensitive file" });
  await expect(row).toContainText("Your role can't open sensitive files.");
  await expect(row.getByRole("button")).toHaveCount(0);
  await expect(meera.getByText("Aadhaar card.pdf")).toHaveCount(0);
  await expectAccessible(meera);
  await meerasPhone.close();
});
