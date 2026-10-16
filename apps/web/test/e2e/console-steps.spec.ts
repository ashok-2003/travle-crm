// The console's steps (spec 6.1, 6.3): platform staff with a temporary password and no two-factor sign in on the one
// sign-in page, replace the password, set two-factor up while features.twoFactor is on, and land in the console, each
// step coming back to it. With two-factor off, the new password leads straight to the console.
import { features } from "@travel-crm/contracts/features";
import { setUpTwoFactor } from "./support/account-steps";
import { expect, test } from "./support/console";

test("new platform staff replace their temporary password, set up two-factor when on, and land in the console", async ({
  page,
  newcomer,
}) => {
  await page.goto("/console");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fconsole$/);
  await page.getByRole("textbox", { name: "Email" }).fill(newcomer.email);
  await page.getByLabel("Password", { exact: true }).fill(newcomer.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/change-password\?next=%2Fconsole$/);
  await expect(page.getByText("Your admin gave you a temporary password.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Your account", exact: true })).toHaveCount(0);
  await page.getByLabel("Temporary password").fill(newcomer.password);
  await page.getByLabel("New password", { exact: true }).fill("newcomers-own-password");
  await page.getByLabel("New password again").fill("newcomers-own-password");
  await page.getByRole("button", { name: "Save new password" }).click();

  if (features.twoFactor) {
    await expect(page).toHaveURL(/\/two-factor-setup\?next=%2Fconsole$/);
    await expect(page.getByText("The platform console asks")).toBeVisible();
    await setUpTwoFactor(page, "newcomers-own-password");
  }

  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page).toHaveURL(/\/console$/);
});
