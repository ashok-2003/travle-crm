// Roles (spec 6.5): an Owner creates a role, gives it a view permission over everyone's records and more, and the
// choice sticks; a role people have can't be deleted, an unused one can; the Owner role can't be changed.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";

test("an Owner creates a role and gives it a view permission over everyone's records", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/roles");
  await expect(page.getByRole("heading", { level: 1, name: "Roles" })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "New role" }).click();
  const dialog = page.getByRole("dialog", { name: "New role" });
  await dialog.getByLabel("Name").fill("Senior sales");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/roles\/senior-sales-[0-9a-f]{6}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Senior sales" })).toBeVisible();

  await page.getByRole("checkbox", { name: "See leads" }).click();
  await page.getByRole("combobox", { name: "Whose records: See leads" }).click();
  await page.getByRole("option", { name: "Everyone's" }).click();
  await page.getByRole("checkbox", { name: "Add leads" }).click();
  await animationsSettled(page);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Senior sales was saved")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "See leads" })).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Whose records: See leads" })).toHaveText("Everyone's");
  await expect(page.getByRole("checkbox", { name: "Add leads" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Change leads" })).not.toBeChecked();
});

test("a role people have can't be deleted, and an unused one can", async ({ page, agency, addStaff }) => {
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByEmail(page, agency.owner);
  await page.goto("/roles");
  await page.getByRole("link", { name: /^Sales/ }).click();
  await expect(page.getByRole("button", { name: "Delete role" })).toBeDisabled();
  await expect(page.getByText("1 person has this role.", { exact: false })).toBeVisible();

  await page.goto("/roles");
  await page.getByRole("link", { name: /^Accounts/ }).click();
  await page.getByRole("button", { name: "Delete role" }).click();
  await page.getByRole("alertdialog", { name: "Delete Accounts?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/roles$/);
  await expect(page.getByText("Accounts was deleted")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Accounts/ })).toHaveCount(0);
});

test("the Owner role can't be changed", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/roles");
  await page.getByRole("link", { name: /^Owner/ }).click();
  await expect(page.getByText("The Owner role always holds every permission", { exact: false })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Add, change and remove staff" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});
