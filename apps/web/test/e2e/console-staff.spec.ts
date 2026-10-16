// Platform staff (spec 5, 6.1; ADR 0019): a super admin adds support, who signs in on their own device with the
// temporary password, replaces it, sets up two-factor (the console requires it) and lands on the dashboard, while the
// super admin's list follows. Support opening the staff screen is told it is a super admin's.
import { setUpTwoFactor } from "./support/account-steps";
import { expect, test } from "./support/console";
import { openConsoleScreen, recordWith, uniqueSuffix } from "./support/console-platform";

test("a super admin adds support, who replaces the temporary password and sets up two-factor", async ({
  page,
  browser,
  superAdmin,
}, testInfo) => {
  const email = `support-${uniqueSuffix()}@platform.test`;
  await openConsoleScreen(page, superAdmin, "/console/staff", "Platform staff");
  await page.getByRole("button", { name: "Add platform staff" }).click();
  const form = page.getByRole("dialog", { name: "Add platform staff" });
  await form.getByLabel("Full name").fill("Neha Joshi");
  await form.getByLabel("Email").fill(email);
  await expect(form.getByRole("radio", { name: "Support" })).toBeChecked();
  // The temporary password is the api's, in its one answer: read it there, then see the screen show it.
  const added = page.waitForResponse((response) => response.url().includes("/api/platform/trpc/platformStaff.add"));
  await form.getByRole("button", { name: "Add", exact: true }).click();
  // The console's client batches its calls: the answer is the batch's one item.
  const [answer] = (await (await added).json()) as [{ result: { data: { temporaryPassword: string } } }];
  const { temporaryPassword } = answer.result.data;
  const handover = page.getByRole("dialog", { name: "Neha Joshi was added" });
  await expect(handover.getByText(temporaryPassword, { exact: true })).toBeVisible();
  await expect(handover.getByText("set up two-factor sign-in")).toBeVisible();
  await handover.getByRole("button", { name: "Done" }).click();
  const newcomer = recordWith(page, testInfo, email);
  await expect(newcomer).toContainText("Must replace the temporary password");
  await expect(newcomer).toContainText("No two-factor yet");

  // Neha, on her own device, signs in on the one sign-in page and is taken through both steps to the console.
  const theirs = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "" });
  const device = await theirs.newPage();
  await device.goto("/console");
  await device.getByRole("textbox", { name: "Email" }).fill(email);
  await device.getByLabel("Password").fill(temporaryPassword);
  await device.getByRole("button", { name: "Sign in" }).click();
  await expect(device).toHaveURL(/\/change-password\?next=%2Fconsole$/);
  await device.getByLabel("Temporary password").fill(temporaryPassword);
  await device.getByLabel("New password", { exact: true }).fill("nehas-own-password");
  await device.getByLabel("New password again").fill("nehas-own-password");
  await device.getByRole("button", { name: "Save new password" }).click();
  await expect(device).toHaveURL(/\/two-factor-setup\?next=%2Fconsole$/);
  await setUpTwoFactor(device, "nehas-own-password");
  await expect(device.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await theirs.close();

  await page.reload();
  await expect(recordWith(page, testInfo, email)).toContainText("Two-factor on");
  await expect(recordWith(page, testInfo, email)).not.toContainText("Must replace the temporary password");
});

test("support opening the staff screen is told it is a super admin's", async ({ page, support }) => {
  await openConsoleScreen(page, support, "/console/staff", "Platform staff");
  await expect(page.getByText("Only a super admin can do this.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add platform staff" })).toHaveCount(0);
});
