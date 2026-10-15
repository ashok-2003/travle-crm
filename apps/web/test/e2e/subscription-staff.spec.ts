// Read-only is "view and export, no new records" (spec 7.3), but taking a departed employee's access away is no new
// record (ADR 0021): an Owner of a read-only agency can't add staff, and sees why, yet can still remove someone.
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";
import { setSubscriptionState } from "./support/subscription-states";

test("in read-only, an Owner can't add staff, and sees why, but can remove someone who left", async ({
  page,
  agency,
  addStaff,
  database,
}) => {
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await setSubscriptionState(database.platform, agency.organizationId, "read_only");
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  const add = page.getByRole("button", { name: "Add staff" });
  await expect(add).toBeDisabled();
  await expect(add).toHaveAccessibleDescription(
    "Your organization is read-only until its payment is made. You can still view and export.",
  );

  await page.getByRole("button", { name: "Actions for Ravi Kumar" }).click();
  await expect(page.getByRole("menuitem", { name: "Change role" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Remove Ravi Kumar?" });
  await animationsSettled(page);
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Ravi Kumar was removed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Actions for Ravi Kumar" })).toHaveCount(0);
});
