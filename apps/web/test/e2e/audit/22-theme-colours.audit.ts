// The visual audit of the colour change (2026-10-28): the sign-in page with its brand panel, a sent quote with blue Save
// and green Send on WhatsApp, and the console's invites screen. The rest of the theme shots are 20-theme.audit.ts.
import { saveBusinessProfile } from "../support/documents";
import { expect, signInToConsole, test } from "../support/console";
import { signInByEmail } from "../support/fixtures";
import { addLeadThroughApi, leadInput } from "../support/leads";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);
test.use({ actionTimeout: 30_000 });

test("Theme colours: sign-in, a sent quote and the console's invites", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(300_000);
  const visitor = await browser.newPage();
  await visitor.setViewportSize(page.viewportSize() ?? { width: 390, height: 844 });
  await visitor.goto("/sign-in");
  await expect(visitor.getByRole("heading", { level: 1 })).toBeVisible();
  await shoot(visitor, "theme-signin");
  await visitor.close();

  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  const leadId = await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Rahul Sharma", phone: "+919876543210" }, trip: { adults: 4 } }),
  );
  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "New quote" }).click();
  await page.getByRole("menuitem", { name: "Blank quote" }).click();
  await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}$/);
  await page.getByLabel("Quote title").fill("Goa for four, 5 nights");
  await page.getByRole("button", { name: "Add a line" }).click();
  await page.getByLabel("What", { exact: true }).fill("Package per adult");
  await page.getByLabel("Price of one").fill("12,000");
  await page.getByLabel("How many").fill("4");
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quote saved")).toBeVisible();
  await page.getByRole("button", { name: "Customer link" }).click();
  await expect(page.getByRole("button", { name: "Send on WhatsApp" })).toBeVisible();
  await shoot(page, "theme-quote-send");

  const staff = await browser.newPage();
  await staff.setViewportSize(page.viewportSize() ?? { width: 390, height: 844 });
  await signInToConsole(staff, superAdmin);
  await staff.goto("/console/invites");
  await expect(staff.getByRole("heading", { level: 1 })).toBeVisible();
  await shoot(staff, "theme-invites");
  await staff.close();
});
