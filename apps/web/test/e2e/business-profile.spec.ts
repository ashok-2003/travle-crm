// The business profile and the setup checklist (spec 7.1): a newly onboarded Owner lands on the checklist, completes
// the business profile (a GSTIN of another state is refused before it is sent) and watches the steps tick.
import { expectAccessible } from "./support/accessibility";
import { KARNATAKA_GSTIN, ONBOARDED_GSTIN, saveOnboardingProfile } from "./support/business";
import { expect, signInByEmail, test } from "./support/fixtures";

test("a newly onboarded Owner fills the profile and watches the checklist tick", async ({ page, agency, database }) => {
  await saveOnboardingProfile(database.platform, agency.organizationId, "Sharma Travels Private Limited");
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  const checklist = page.getByRole("region", { name: "Finish setting up Sharma Travels" });
  await expect(checklist.getByText("0 of 5 done")).toBeVisible();
  await expectAccessible(page);

  await checklist.getByRole("link", { name: /^Business details/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Business profile" })).toBeVisible();
  await expect(page.getByLabel("Legal name")).toHaveValue("Sharma Travels Private Limited");
  await expect(page.getByLabel("GSTIN")).toHaveValue(ONBOARDED_GSTIN);
  await expect(page.getByLabel("Contact phone")).toHaveValue("98200 12345");
  await expectAccessible(page);

  await page.getByLabel("GSTIN").fill(KARNATAKA_GSTIN);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("This GSTIN is registered in Karnataka. Choose that state, or check the GSTIN."),
  ).toBeVisible();
  await page.getByLabel("GSTIN").fill(ONBOARDED_GSTIN.toLowerCase());
  await page.getByLabel("Address").fill("14 Linking Road, Bandra West, Mumbai 400050");
  await page.getByLabel("Account name").fill("Sharma Travels Private Limited");
  await page.getByLabel("Account number").fill("0012 3456 7890");
  await page.getByLabel("IFSC").fill("hdfc0001234");
  await page.getByLabel("Bank", { exact: true }).fill("HDFC Bank");
  await page.getByLabel("Invoice prefix").fill("st");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("The business profile was saved")).toBeVisible();
  // The form shows what the api keeps, the account number by its last four digits only.
  await expect(page.getByLabel("GSTIN")).toHaveValue(ONBOARDED_GSTIN);
  await expect(page.getByLabel("IFSC")).toHaveValue("HDFC0001234");
  await expect(page.getByLabel("Account number")).toHaveValue("XXXX7890");
  await expect(page.getByRole("button", { name: "Change the account number" })).toBeVisible();
  await expect(page.getByLabel("Invoice prefix")).toHaveValue("ST");

  await page.goto("/setup");
  await expect(page.getByRole("heading", { level: 1, name: "Set up your organization" })).toBeVisible();
  await expect(page.getByText("3 of 5 done")).toBeVisible();
  // The checklist's own links: the navigation has a Staff item too.
  const steps = page.getByRole("main").getByRole("list");
  for (const [step, status] of [
    ["Business details", "Done"],
    ["Bank details", "Done"],
    ["Invoice prefix", "Done"],
    ["Branding", "To do"],
    ["Staff", "To do"],
  ] as const) {
    await expect(
      steps.getByRole("link", { name: new RegExp(`^${step}`) }).getByText(status, { exact: true }),
    ).toBeVisible();
  }
  await page.goto("/");
  await expect(checklist.getByText("3 of 5 done")).toBeVisible();
});
