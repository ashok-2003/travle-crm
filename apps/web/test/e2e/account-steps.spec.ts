// The steps the api can insist on before anything else (spec 6.3, 6.2): a temporary password replaced at the first
// sign-in; with two-factor off (features.twoFactor), none for an organization whose row requires it, and no
// two-factor on the account; while it is on, two-factor turned on from one's account, then the code at sign-in.
import { features } from "@travel-crm/contracts/features";
import { expectAccessible } from "./support/accessibility";
import { setUpTwoFactor, signInWithCode } from "./support/account-steps";
import { expect, signInByEmail, test } from "./support/fixtures";
import { totpCode } from "./support/totp";

test("staff with a temporary password choose their own at the first sign-in", async ({ page, agency, addStaff }) => {
  const meera = await addStaff({
    name: "Meera Iyer",
    username: "meera",
    roleKey: "operations",
    mustChangePassword: true,
  });
  await signInWithCode(page, agency.code, meera);
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByText("Your admin gave you a temporary password.")).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Temporary password").fill(meera.password);
  await page.getByLabel("New password", { exact: true }).fill("meeras-own-password");
  await page.getByLabel("New password again").fill("meeras-own-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Meera Iyer" })).toBeVisible();

  await page.context().clearCookies();
  await signInWithCode(page, agency.code, { username: meera.username, password: "meeras-own-password" });
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Meera Iyer" })).toBeVisible();
});

test("with two-factor off, an organization whose row requires it sends nobody to set it up", async ({
  page,
  agency,
  addStaff,
  database,
}) => {
  test.skip(features.twoFactor, "Two-factor is on: apps/api's two-factor tests hold staff at setup.");
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await database.platform.organization.update({
    where: { id: agency.organizationId },
    data: { requireTwoFactor: true },
  });
  await signInWithCode(page, agency.code, ravi);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ravi Kumar" })).toBeVisible();
  // The setup's page, opened by its address, sends people home.
  await page.goto("/two-factor-setup");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ravi Kumar" })).toBeVisible();
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/two-factor/i);
  await expectAccessible(page);
});

test("an Owner turns two-factor on from their account, then signs in with a code", async ({ page, agency }) => {
  test.skip(!features.twoFactor, "Two-factor is off (features.twoFactor).");
  await signInByEmail(page, agency.owner);
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await expect(page.getByText(agency.owner.email)).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Set up" }).click();
  // A setup the Owner chose has a way back; the one an organization requires doesn't.
  await expect(page.getByRole("link", { name: "Your account", exact: true })).toBeVisible();
  const secret = await setUpTwoFactor(page, agency.owner.password);
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(agency.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The next 30-second code, so this journey doesn't rely on Better Auth taking the code that turned two-factor on a
  // second time. Better Auth 1.7.7 would (it has no replay check); the window it accepts includes the next code.
  await page.getByLabel("Code from your authenticator app").fill(totpCode(secret, Date.now() + 30_000));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
});
