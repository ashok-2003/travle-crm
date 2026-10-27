// Spec 12.1's journey "an organization in read_only": an agency the lifecycle has made read-only says so on every
// screen, which all still open (spec 7.3: view and export, no new records).
import { expect, homeGreeting, signInByEmail, test } from "./support/fixtures";
import { setSubscriptionState } from "./support/subscription-states";

test("an organization in read_only shows the banner on every screen", async ({ page, agency, database }) => {
  await setSubscriptionState(database.platform, agency.organizationId, "read_only");
  await signInByEmail(page, agency.owner);
  const screens = [
    ["/", homeGreeting(agency.owner.name)],
    ["/staff", "Staff"],
    ["/roles", "Roles"],
    ["/settings", "Settings"],
    ["/account", "Your account"],
  ] as const;
  for (const [path, title] of screens) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Read-only until paid: you can view and export")).toBeVisible();
  }
});
