// Support's impersonation (spec 6.1, 12.1's impersonation journey): support opens an agency's page in the console,
// signs in as its Owner after confirming, sees the agency as the Owner does under the banner, stops, and is back in
// the console.
import { expect, signInToConsole, test } from "./support/console";

test("support opens an agency, signs in as its Owner, sees the agency under the banner, and stops", async ({
  page,
  support,
  agency,
}) => {
  await signInToConsole(page, support);
  await page.goto(`/console/organizations/${agency.organizationId}`);
  await expect(page.getByRole("heading", { level: 1, name: agency.name })).toBeVisible();
  await expect(page).toHaveTitle(/^Organization · Console · /);

  const members = page.getByRole("region", { name: "Members" });
  await expect(members.getByText(agency.owner.email)).toBeVisible();
  await members.getByRole("button", { name: `Sign in as ${agency.owner.name}` }).click();
  const confirm = page.getByRole("alertdialog", { name: `Sign in as ${agency.owner.name}?` });
  await expect(confirm.getByText("recorded in the organization's audit log")).toBeVisible();
  await confirm.getByRole("button", { name: `Sign in as ${agency.owner.name}` }).click();

  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(`You're signed in as ${agency.owner.name} at ${agency.name}.`)).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page).toHaveURL(/\/console$/);
});
