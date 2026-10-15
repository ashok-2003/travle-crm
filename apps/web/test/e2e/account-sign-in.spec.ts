// Signing in (spec 6.3, spec 12.1's first journey): by email, and by organization code and username, which the device
// then remembers; a wrong password says so; with two-factor on, the code comes next. Either way the person lands on
// the page they were sent from (?next=).
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { secretOf, totpCode } from "./support/totp";

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
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
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
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ravi Kumar" })).toBeVisible();

  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
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

test("with two-factor on, the code from the app comes after the password", async ({ page, agency }) => {
  // Turn two-factor on through the api, as the setup screen does, and keep the secret the phone would hold.
  await signInByEmail(page, agency.owner);
  const origin = { origin: process.env.E2E_BASE_URL ?? "" };
  const enable = await page.request.post("/api/auth/two-factor/enable", {
    data: { password: agency.owner.password },
    headers: origin,
  });
  const secret = secretOf(((await enable.json()) as { totpURI: string }).totpURI);
  await page.request.post("/api/auth/two-factor/verify-totp", { data: { code: totpCode(secret) }, headers: origin });
  await page.context().clearCookies();

  await page.goto("/sign-in?next=%2Faccount");
  await page.getByRole("textbox", { name: "Email" }).fill(agency.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(agency.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Enter your code" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Code from your authenticator app").fill(totpCode(secret));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
});
