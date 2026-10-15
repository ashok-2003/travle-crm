// Settings (spec 6.2): the organization's code to hand out, and the two-factor requirement, which an Owner can only
// turn on once they use two-factor themselves, which sticks, and which only an Owner can turn off again.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { turnOnTwoFactor } from "./support/organization-two-factor";
import { signInWithCode } from "./support/sign-in-with-code";

test("an Owner without two-factor is told to set it up before requiring it", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByText(agency.code, { exact: true })).toBeVisible();
  await expectAccessible(page);

  const requirement = page.getByRole("switch", { name: "Require two-factor sign-in for everyone" });
  await requirement.click();
  await expect(page.getByText("Turn on two-factor sign-in for yourself first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Set up two-factor for yourself" })).toBeVisible();
  await expect(requirement).not.toBeChecked();
});

test("an Owner who uses two-factor requires it for everyone, and it sticks", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await turnOnTwoFactor(page.request, agency.owner.password);
  await page.goto("/settings");
  const requirement = page.getByRole("switch", { name: "Require two-factor sign-in for everyone" });
  await requirement.click();
  await expect(requirement).toBeChecked();
  await expect(page.getByText("Two-factor sign-in is now required for everyone")).toBeVisible();
  await page.reload();
  await expect(requirement).toBeChecked();
  await requirement.click();
  await expect(requirement).not.toBeChecked();
  await expect(page.getByText("Two-factor sign-in is now optional")).toBeVisible();
});

test("an Admin can't stop requiring two-factor, and sees why", async ({ page, agency, addStaff, database }) => {
  const admin = await addStaff({ name: "Kiran Admin", username: "kiran", roleKey: "org-admin" });
  await signInWithCode(page.request, { orgCode: agency.code, username: admin.username, password: admin.password });
  await turnOnTwoFactor(page.request, admin.password);
  await database.platform.organization.update({
    where: { id: agency.organizationId },
    data: { requireTwoFactor: true },
  });
  await page.goto("/settings");
  const requirement = page.getByRole("switch", { name: "Require two-factor sign-in for everyone" });
  await expect(requirement).toBeChecked();
  await expect(requirement).toBeDisabled();
  await expect(page.getByText("Only an Owner can stop requiring two-factor sign-in.")).toBeVisible();
});
