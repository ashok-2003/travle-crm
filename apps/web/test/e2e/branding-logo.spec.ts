// The branding screen (spec 9.3): an Owner uploads a logo, which the browser sends straight to storage (MinIO, through
// the policy's STORAGE_ORIGIN) and then shows, and saves the colour and terms their documents carry.
import { logoPng, saveBusinessProfile } from "./support/documents";
import { expect, signInByEmail, test } from "./support/fixtures";

test("an Owner uploads a logo and sees it, and saves the brand colour and terms", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await page.goto("/settings/branding");
  await expect(page.getByRole("heading", { level: 1, name: "Branding" })).toBeVisible();
  await expect(page.getByText("No logo yet.")).toBeVisible();

  await page.getByLabel("Logo image").setInputFiles(logoPng);
  const logo = page.getByRole("img", { name: "Your logo" });
  await expect(logo).toBeVisible();
  // Loaded from storage, not a broken image.
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("Logo saved")).toBeVisible();

  await page.getByRole("textbox", { name: "Brand colour", exact: true }).fill("#1f6f5c");
  await page.getByRole("textbox", { name: "Terms" }).fill("50% to book, the balance 30 days before travel.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Branding saved")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Brand colour", exact: true })).toHaveValue("#1f6f5c");
  await expect(page.getByRole("textbox", { name: "Terms" })).toHaveValue(
    "50% to book, the balance 30 days before travel.",
  );
  await expect(page.getByRole("img", { name: "Your logo" })).toBeVisible();
});
