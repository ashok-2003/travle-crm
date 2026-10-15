// Resetting a forgotten password (spec 6.2): asking for the link, the email the api sends (read from Mailpit),
// following it, choosing a new password and signing in with it; and a link that has expired or was used. The token
// leaves the address bar as soon as the screen has read it (ADR 0006), and saving still sends it.
import { expectAccessible } from "./support/accessibility";
import { expect, test } from "./support/fixtures";
import { resetLinkSentTo } from "./support/mailpit";

test("the forgot-password screen explains both ways to get a new password", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
  await expect(page.getByText("ask your admin to reset your password")).toBeVisible();
  await expectAccessible(page);
});

test("a forgotten password is reset from the emailed link, and the new one signs in", async ({ page, agency }) => {
  const newPassword = "a-forgotten-one-replaced";
  await page.goto("/forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: /a link to reset its password is on its way/ }),
  ).toBeVisible();

  // The link goes to the api, which checks the token and sends the browser on to the reset screen with it.
  await page.goto(await resetLinkSentTo(agency.owner.email));
  await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("New password again").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Your password is changed/ })).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
});

test("an expired or used link offers a new one", async ({ page }) => {
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText("This reset link has expired or was used already.")).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expectAccessible(page);

  await page.goto("/reset-password?token=not-a-real-token");
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await page.getByLabel("New password again").fill("a-brand-new-password");
  const saved = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/auth/reset-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  const request = await saved;
  expect(request.postDataJSON()).toMatchObject({ token: "not-a-real-token" });
  // Sent from the cleaned address, so the request's Referer no longer carries the token either.
  expect((await request.allHeaders()).referer ?? "").not.toContain("not-a-real-token");
  await page.getByRole("link", { name: "Ask for a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});
