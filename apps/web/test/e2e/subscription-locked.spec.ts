// Suspended or cancelled, an agency's screens are replaced by what happened and how to reach support (spec 7.3), the
// person's own account aside; while suspended, the Owner is shown the way to Staff, to take someone's access away.
import { brand } from "@travel-crm/brand";
import { expect, signInByCode, signInByEmail, test } from "./support/fixtures";
import { setSubscriptionState } from "./support/subscription-states";

test("a suspended agency's screens say so and how to reach support, and the Owner can reach Staff", async ({
  page,
  agency,
  database,
}) => {
  await setSubscriptionState(database.platform, agency.organizationId, "suspended");
  await signInByEmail(page, agency.owner);
  await page.goto("/roles");
  await expect(page.getByRole("heading", { level: 1, name: "Your organization is suspended" })).toBeVisible();
  await expect(page.getByRole("link", { name: brand.supportEmail })).toHaveAttribute(
    "href",
    `mailto:${brand.supportEmail}`,
  );
  await page.getByRole("link", { name: "Go to Staff" }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("heading", { level: 1, name: "Staff" })).toBeVisible();
});

test("a cancelled agency's screens are shut to everyone, but each person's own account", async ({
  page,
  agency,
  addStaff,
  database,
}) => {
  const kiran = await addStaff({ name: "Kiran Rao", username: "kiran", roleKey: "org-admin" });
  await setSubscriptionState(database.platform, agency.organizationId, "cancelled");
  await signInByCode(page, { code: agency.code, staff: kiran });
  for (const path of ["/", "/staff", "/settings"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: "Your organization's subscription has ended" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Staff" })).toHaveCount(0);
  }
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
});
