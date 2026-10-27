// Signing in (spec 6.3, spec 12.1's first journey): by email, and by organization code and username, which the device
// then remembers; a wrong password says so; with two-factor off (features.twoFactor), the password alone signs in
// even a person whose row says two-factor is on (account-steps.spec.ts has the code, while it is on). Either way the
// person lands on the page they were sent from (?next=).
import { features } from "@travel-crm/contracts/features";
import { expectAccessible } from "./support/accessibility";
import { expect, homeGreeting, signOutOf, test } from "./support/fixtures";

test("an Owner signs in by email, back to the page they were sent from", async ({ page, agency }) => {
  // Before its script runs, the prerendered page shows a skeleton, not an empty column.
  expect(await (await page.request.get("/sign-in")).text()).toContain('aria-busy="true"');
  await page.goto("/sign-in?next=%2Fstaff");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(page).toHaveTitle(/^Sign in · /);
  await expectAccessible(page);
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  const password = page.getByLabel("Password", { exact: true });
  await password.fill(agency.owner.password);
  // The eye shows what was typed, and the form still sends it.
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue(agency.owner.password);
  await expect(page.getByRole("button", { name: "Hide password" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Staff" })).toBeVisible();
  await expect(page).toHaveURL(/\/staff$/);
});

test("staff sign in with the organization code, which the device then remembers", async ({
  page,
  agency,
  addStaff,
}, testInfo) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Organization code" }).click();
  await page.getByRole("textbox", { name: "Organization code" }).fill(agency.code.toLowerCase());
  await page.getByRole("textbox", { name: "Username" }).fill(ravi.username);
  await page.getByLabel("Password", { exact: true }).fill(ravi.password);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: homeGreeting("Ravi Kumar") })).toBeVisible();

  await signOutOf(page, { phone: testInfo.project.name === "phone" });
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("tab", { name: "Organization code" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "Organization code" })).toHaveValue(agency.code);
});

test("a wrong password says so, and signs nobody in", async ({ page, agency }) => {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That email and password don't match." })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("with two-factor off, the password alone signs in a person whose row says it is on", async ({
  page,
  agency,
  database,
}) => {
  test.skip(features.twoFactor, "Two-factor is on: account-steps.spec.ts has the code.");
  // As finishing the setup screen left it while two-factor was on.
  const owner = await database.platform.user.update({
    where: { email: agency.owner.email },
    data: { twoFactorEnabled: true },
  });
  await database.platform.twoFactor.create({ data: { userId: owner.id, secret: "stored", backupCodes: "stored" } });

  // The code's page, opened by its address, sends people to sign in.
  await page.goto("/sign-in/two-factor?next=%2Faccount");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/sign-in?next=%2Faccount");
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(agency.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(/two-factor/i);
});
