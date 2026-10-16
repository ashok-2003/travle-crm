// Settings (spec 6.2): the organization's code to hand out, and the two-factor requirement only while features.twoFactor
// is on. Who may switch the requirement, and what it then asks of staff, is apps/api's two-factor tests' and the
// requirement's own unit tests'.
import { features } from "@travel-crm/contracts/features";
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";

test("an Owner sees the code to hand out, and the two-factor requirement only while two-factor is on", async ({
  page,
  agency,
  database,
}) => {
  // Off, even an organization stored as requiring it, as one could be left while two-factor was on, shows none of it.
  if (!features.twoFactor) {
    await database.platform.organization.update({
      where: { id: agency.organizationId },
      data: { requireTwoFactor: true },
    });
  }
  await signInByEmail(page, agency.owner);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByText(agency.code, { exact: true })).toBeVisible();
  const requirement = page.getByRole("switch", { name: "Require two-factor sign-in for everyone" });
  if (features.twoFactor) await expect(requirement).toBeVisible();
  else await expect(page.getByRole("main")).not.toContainText(/two-factor/i);
  await expectAccessible(page);
});
