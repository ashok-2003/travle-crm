// The platform log (spec 5, 7): a super admin's changes show, newest first, each with what was done, by whom, the
// organization it concerns and when. The log is the whole platform's, written by every journey running at once, so
// this one finds its entries by the plan it made and the agency it corrected.
import { expect, signInToConsole, test } from "./support/console";
import { consoleCall, uniqueSuffix } from "./support/console-platform";

test("a super admin finds their own changes in the platform log", async ({ page, superAdmin, agency }) => {
  const name = `Journey ${uniqueSuffix()}`;
  await signInToConsole(page, superAdmin);
  const plan = (await consoleCall(page, "plans.create", {
    key: `journey-${uniqueSuffix()}`,
    name,
    monthlyPricePaise: 99_900,
    yearlyPricePaise: null,
    seatLimit: 3,
    whatsappNumberLimit: 1,
    storageLimitBytes: 1024 ** 3,
    modules: [],
  })) as { id: string };
  // Plans are global: off sale again at once, so no other journey is offered it.
  await consoleCall(page, "plans.archive", { planId: plan.id });
  await consoleCall(page, "organizations.update", {
    organizationId: agency.organizationId,
    name: agency.name,
    timeZone: "Asia/Kolkata",
    contactEmail: null,
  });

  await page.goto("/console/log");
  await expect(page.getByRole("heading", { level: 1, name: "Platform log" })).toBeVisible();
  const entries = page.getByRole("main").getByRole("listitem");
  const corrected = entries
    .filter({ hasText: "Corrected the organization's details" })
    .filter({ has: page.locator(`a[href="/console/organizations/${agency.organizationId}"]`) });
  await expect(corrected).toContainText("You");
  await expect(corrected.getByRole("link", { name: agency.name })).toBeVisible();

  const created = entries.filter({ hasText: "Created a plan" }).filter({ hasText: name });
  await expect(created).toContainText("You");
  await created.getByRole("button", { name: "What changed" }).click();
  await expect(created.getByText("monthlyPricePaise", { exact: true })).toBeVisible();
  await expect(created.getByText("99900", { exact: true })).toBeVisible();
});
