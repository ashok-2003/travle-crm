// The console's plans and policy (spec 7.2, 7.3): a super admin creates a plan, changes its price and archives it;
// support sees the plans and the policy, told that only a super admin changes them. Plans and the policy belong to the
// whole platform: this journey's plan has a key of its own and ends archived, off sale, and the policy is saved with
// the days it already has, so journeys running at the same time see no change.
import { expect, test } from "./support/console";
import { openConsoleScreen, recordWith, uniqueSuffix } from "./support/console-platform";

test("a super admin creates a plan, changes its yearly price and archives it", async ({
  page,
  superAdmin,
}, testInfo) => {
  const suffix = uniqueSuffix();
  const name = `Journey ${suffix}`;
  await openConsoleScreen(page, superAdmin, "/console/plans", "Plans");

  await page.getByRole("button", { name: "New plan" }).click();
  const form = page.getByRole("dialog", { name: "New plan" });
  await form.getByLabel("Key").fill(`journey-${suffix}`);
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Monthly price").fill("4,999");
  await form.getByLabel("Seats included").fill("10");
  await form.getByLabel("WhatsApp numbers").fill("2");
  await form.getByLabel("Storage (GB)").fill("25");
  await form.getByRole("checkbox", { name: "CRM" }).check();
  await form.getByRole("button", { name: "Create plan" }).click();

  const shown = recordWith(page, testInfo, name);
  await expect(shown).toContainText("₹4,999");
  await expect(shown).toContainText("25 GB");
  await shown.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: `Edit ${name}` });
  await edit.getByLabel("Yearly price").fill("49,990");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  await expect(shown).toContainText("₹49,990");

  await shown.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();
  await expect(recordWith(page.getByRole("region", { name: "Archived" }), testInfo, name)).toBeVisible();
});

test("support sees the plans and the policy, and that only a super admin changes them", async ({
  page,
  support,
  agency,
}) => {
  // The agency's subscription puts the journeys' own plan on sale, so there is one to see.
  expect(agency.code).not.toBe("");
  await openConsoleScreen(page, support, "/console/plans", "Plans");
  await expect(page.getByText("Only a super admin can change plans and the policy.")).toBeVisible();
  await expect(page.getByText("Everything (tests)").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "New plan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
  const policy = page.getByRole("region", { name: "Subscription policy" });
  await expect(policy.getByText("Trial days", { exact: true })).toBeVisible();
  await expect(policy.getByRole("button", { name: "Change the policy" })).toHaveCount(0);
});

test("a super admin saves the subscription policy", async ({ page, superAdmin }) => {
  await openConsoleScreen(page, superAdmin, "/console/plans", "Plans");
  await page.getByRole("button", { name: "Change the policy" }).click();
  const dialog = page.getByRole("dialog", { name: "Change the policy" });
  await expect(dialog.getByLabel("Days past due")).not.toHaveValue("");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Policy saved")).toBeVisible();
  await expect(dialog).toBeHidden();
});
