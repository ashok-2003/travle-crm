// Resetting a forgotten password (spec 6.2). The emailed link needs plan 3's Task I3 (the api sending reset email,
// read here from Mailpit); until it is merged these journeys cover the screens and the token check.
import { expectAccessible } from "./support/accessibility";
import { expect, test } from "./support/fixtures";

test("the forgot-password screen explains both ways to get a new password", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
  await expect(page.getByText("ask your admin to reset your password")).toBeVisible();
  await expectAccessible(page);
});

test("an expired or used link offers a new one", async ({ page }) => {
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText("This reset link has expired or was used already.")).toBeVisible();
  await expectAccessible(page);

  await page.goto("/reset-password?token=not-a-real-token");
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await page.getByLabel("New password again").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.getByRole("link", { name: "Ask for a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});
