// The steps the api can insist on before anything else (spec 6.3, 6.2): a temporary password replaced at the first
// sign-in, and two-factor set up when the organization requires it; and two-factor turned on from one's account.
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

test("an organization that requires two-factor sends staff to set it up first", async ({
  page,
  agency,
  addStaff,
  database,
}) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await database.platform.organization.update({
    where: { id: agency.organizationId },
    data: { requireTwoFactor: true },
  });
  await signInWithCode(page, agency.code, ravi);
  await expect(page).toHaveURL(/\/two-factor-setup$/);
  await expect(page.getByText("Your organization asks everyone")).toBeVisible();
  await expect(page.getByRole("link", { name: "Your account", exact: true })).toHaveCount(0);
  await expectAccessible(page);
  await setUpTwoFactor(page, ravi.password);
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ravi Kumar" })).toBeVisible();
});

test("an Owner turns two-factor on from their account, then signs in with a code", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await expect(page.getByText(agency.owner.email)).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Set up" }).click();
  // A setup the Owner chose has a way back; the one an organization requires (above) doesn't.
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
