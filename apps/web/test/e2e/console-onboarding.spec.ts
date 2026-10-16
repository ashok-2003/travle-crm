// Onboarding an agency from the console (spec 7.1): support fills in the agency, its business profile, its Owner and
// a plan on sale; the organization's page says the invite went out; the worker emails it (Mailpit); the Owner chooses
// a password from its link and signs in to the agency.
import { choose, expect, inviteLinkSentTo, organizationCode, test } from "./support/console-organizations";
import { signInToConsole } from "./support/console";

test("support onboards an agency, whose Owner chooses a password from the invite and signs in", async ({
  page,
  support,
  planOnSale,
}) => {
  const code = organizationCode("ON");
  const owner = { name: "Lakshmi Nair", email: `lakshmi-${code.toLowerCase()}@example.test` };
  await signInToConsole(page, support);
  await page.goto("/console/organizations/new");
  await expect(page.getByRole("heading", { level: 1, name: "Onboard an agency" })).toBeVisible();
  await expect(page).toHaveTitle(/^Onboard an agency · Console · /);

  await page.getByLabel("Agency name").fill("Kerala Trails");
  await page.getByLabel("Organization code").fill(code);
  await page.getByLabel("Contact email").fill(`hello-${code.toLowerCase()}@example.test`);
  await page.getByLabel("Legal name").fill("Kerala Trails LLP");
  await choose(page, "GST state", /Kerala/);
  // A GSTIN of another state is refused before anything is sent.
  await page.getByLabel("GSTIN").fill("27AAPFU0939F1ZV");
  await page.getByLabel("Owner's name").fill(owner.name);
  await page.getByLabel("Owner's email").fill(owner.email);
  await choose(page, "Plan", new RegExp(planOnSale.name));
  await page.getByRole("button", { name: "Onboard the agency" }).click();
  await expect(page.getByText("This GSTIN is of another state.")).toBeVisible();
  await page.getByLabel("GSTIN").fill("32AAPFU0939F1Z4");
  await page.getByRole("button", { name: "Onboard the agency" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Kerala Trails" })).toBeVisible();
  await expect(page.getByText("The Owner has an email invite to choose a password.")).toBeVisible();
  const record = page.getByRole("region", { name: "Organization" });
  await expect(record.getByText(code, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Members" }).getByText("Invite sent, no password yet")).toBeVisible();

  // The Owner, in a browser of their own.
  await page.context().clearCookies();
  await page.goto(await inviteLinkSentTo(owner.email));
  await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("lakshmi-password-1");
  await page.getByLabel("New password again").fill("lakshmi-password-1");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Your password is changed/ })).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill("lakshmi-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${owner.name}` })).toBeVisible();
});
