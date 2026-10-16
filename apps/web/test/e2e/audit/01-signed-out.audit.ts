// The visual audit's signed-out screens and the steps the api can insist on: sign-in on both tabs, a forgotten
// password reset from the link Mailpit received, the offline and unknown pages, a share link that doesn't work, a
// temporary password to replace, two-factor set up because the organization requires it, the two-factor challenge
// and the account it leads to.
import { signInWithCode } from "../support/account-steps";
import { expect, signInByEmail, test } from "../support/fixtures";
import { resetLinkSentTo } from "../support/mailpit";
import { turnOnTwoFactor } from "../support/organization-two-factor";
import { totpCode } from "../support/totp";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

test("signed out: sign-in, a password reset, the offline and unknown pages", async ({ page, agency }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await shoot(page, "sign-in-email");
  await page.getByRole("tab", { name: "Organization code" }).click();
  await expect(page.getByRole("textbox", { name: "Organization code" })).toBeVisible();
  await shoot(page, "sign-in-code");

  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
  await shoot(page, "forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: /a link to reset its password is on its way/ }),
  ).toBeVisible();
  await shoot(page, "forgot-password-sent");

  await page.goto(await resetLinkSentTo(agency.owner.email));
  await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
  await shoot(page, "reset-password");
  await page.getByLabel("New password", { exact: true }).fill("a-forgotten-one-replaced");
  await page.getByLabel("New password again").fill("a-forgotten-one-replaced");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Your password is changed/ })).toBeVisible();
  await shoot(page, "reset-password-done");
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText("This reset link has expired or was used already.")).toBeVisible();
  await shoot(page, "reset-password-expired");

  await page.goto("/offline");
  await expect(page.getByRole("heading", { level: 1, name: "You're offline" })).toBeVisible();
  await shoot(page, "offline");
  expect((await page.goto("/no-such-screen"))?.status()).toBe(404);
  await shoot(page, "not-found");
  // A whole token's length, as a customer pasting a link cut short or mistyped would open.
  expect((await page.goto(`/p/${"x".repeat(65)}`))?.status()).toBe(404);
  await expect(page.getByText("This link doesn't work")).toBeVisible();
  await shoot(page, "share-link-not-found");
});

test("the steps the api insists on: a temporary password, two-factor the organization requires", async ({
  page,
  agency,
  addStaff,
  database,
}) => {
  const meera = await addStaff({
    name: "Meera Iyer",
    username: "meera",
    roleKey: "operations",
    mustChangePassword: true,
  });
  await signInWithCode(page, agency.code, meera);
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByText("Your admin gave you a temporary password.")).toBeVisible();
  await shoot(page, "change-password");

  await page.context().clearCookies();
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await database.platform.organization.update({
    where: { id: agency.organizationId },
    data: { requireTwoFactor: true },
  });
  await signInWithCode(page, agency.code, ravi);
  await expect(page).toHaveURL(/\/two-factor-setup$/);
  await expect(page.getByText("Your organization asks everyone")).toBeVisible();
  await shoot(page, "two-factor-setup");
  // The setup's steps one at a time (support/account-steps.ts takes them all at once).
  await page.getByLabel("Password", { exact: true }).fill(ravi.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  await shoot(page, "two-factor-setup-qr");
  const key = await page.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/).textContent();
  await page.getByLabel("Then type the 6-digit code the app shows.").fill(totpCode((key ?? "").replaceAll(" ", "")));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("heading", { name: "Save your backup codes" })).toBeVisible();
  await shoot(page, "two-factor-backup-codes");
});

test("an Owner with two-factor on: the challenge at sign-in, then the account", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  const secret = await turnOnTwoFactor(page.request, agency.owner.password);
  await page.context().clearCookies();
  await page.goto("/sign-in?next=%2Faccount");
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(agency.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Enter your code" })).toBeVisible();
  await shoot(page, "two-factor-challenge");
  // The next 30-second code: the one that turned two-factor on was just used.
  await page.getByLabel("Code from your authenticator app").fill(totpCode(secret, Date.now() + 30_000));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await shoot(page, "account");
});
