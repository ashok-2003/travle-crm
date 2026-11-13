// The visual audit of the automatic WhatsApps (2026-10-29): Settings, Sales automation. The earlier autopilot's screens went
// with the move to the AI agent page.
import { expect, signInToConsole, test } from "../support/console";
import { signInByEmail } from "../support/fixtures";
import { connectNumber, newCustomerNumber, openNewChat } from "../support/whatsapp";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);
test.use({ actionTimeout: 30_000 });

test("Sales automation", async ({ page, browser, superAdmin, agency }) => {
  test.setTimeout(360_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await owner.setViewportSize(page.viewportSize() ?? { width: 390, height: 844 });
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  await openNewChat(owner, business, customer, "Rahul Mehta", "Hi, do you have a Kerala package for 4?");

  await owner.goto("/settings/sales-automation");
  await expect(owner.getByRole("heading", { level: 1, name: "Sales automation" })).toBeVisible();
  await shoot(owner, "step2-sales-automation");
});
