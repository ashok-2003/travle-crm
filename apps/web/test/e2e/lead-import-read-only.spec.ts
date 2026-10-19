// A read-only agency (spec 3.1, ADR 0021, 12.1): Import is off on Leads, with its hint as its description, and the
// import page's file button is off too; the lists and the rest still open.
import { expect, signInByEmail, test } from "./support/fixtures";
import { setSubscriptionState } from "./support/subscription-states";

test("a read-only agency: Import is off with its hint", async ({ page, agency, database }) => {
  await setSubscriptionState(database.platform, agency.organizationId, "read_only");
  await signInByEmail(page, agency.owner);
  await page.goto("/leads");
  await expect(page.getByRole("heading", { level: 1, name: "Leads" })).toBeVisible();
  const button = page.getByRole("main").getByRole("button", { name: "Import" });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(
    "Your organization is read-only until its payment is made. You can still view and export.",
  );
  await expect(page.getByRole("main").getByRole("link", { name: "Import" })).toHaveCount(0);

  await page.goto("/leads/import");
  await expect(page.getByRole("heading", { level: 1, name: "Import leads" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a file" })).toBeDisabled();
});
