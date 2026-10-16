// The visual audit's console screens: a super admin's (two-factor on) dashboard, onboarding with the calendar open, an
// organization's page with a payment recorded and its dialogs, plans and the policy, jobs with a failed job and a
// leftover schedule, the platform log, platform staff and the password handover, and data protection with an
// export; then support's dashboard and organization page, and support signed in as the agency's Owner.
import type { TestInfo } from "@playwright/test";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { saveOnboardingProfile } from "../support/business";
import { signInToConsole } from "../support/console";
import { chooseDay, expect, test } from "../support/console-organizations";
import { addFailedJob, addLeftoverSchedule, recordWith, uniqueSuffix } from "../support/console-platform";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";

test("a super admin's console, screen by screen", async ({
  page,
  superAdmin,
  agency,
  addStaff,
  database,
  planOnSale,
}, testInfo) => {
  // An organization on a plan with a price, with a profile and staff; a failed job and a leftover schedule.
  await database.platform.subscription.update({
    where: { organizationId: agency.organizationId },
    data: { planId: planOnSale.id },
  });
  await saveOnboardingProfile(database.platform, agency.organizationId, "Sharma Travels Private Limited");
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  const failedQueue = `probe.audit-${uniqueSuffix()}`;
  await addFailedJob(failedQueue);
  const leftoverQueue = `probe.audit-${uniqueSuffix()}`;
  await addLeftoverSchedule(leftoverQueue);

  await signInToConsole(page, superAdmin);
  await page.goto("/console");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("main").locator('a[href^="/console/organizations/"]').first()).toBeVisible();
  await shoot(page, "console-dashboard");
  if (isPhone(testInfo)) {
    const bar = page.getByRole("navigation", { name: "Console" }).filter({ visible: true });
    await bar.getByRole("button", { name: "More" }).click();
    const more = page.getByRole("dialog");
    await expect(more).toBeVisible();
    await shoot(page, "console-more-sheet");
    await page.keyboard.press("Escape");
    await expect(more).toHaveCount(0);
  }

  await page.goto("/console/organizations/new");
  await expect(page.getByRole("heading", { level: 1, name: "Onboard an agency" })).toBeVisible();
  await shoot(page, "console-onboard");
  await page.getByRole("radio", { name: "A trial until a day you choose" }).check();
  await page.getByRole("button", { name: "Choose The trial's last day from the calendar" }).click();
  await expect(page.locator("[data-slot=calendar]")).toBeVisible();
  await shoot(page, "console-onboard-calendar");
  await page.keyboard.press("Escape");

  await page.goto(`/console/organizations/${agency.organizationId}`);
  const members = page.getByRole("region", { name: "Members" });
  await expect(members.getByText(agency.owner.email)).toBeVisible();
  const subscription = page.getByRole("region", { name: "Subscription" });
  await subscription.getByRole("button", { name: "Record a payment" }).click();
  const payment = page.getByRole("dialog", { name: "Record a payment" });
  await payment.getByLabel("Amount received").fill("2950");
  await chooseDay(payment, "Pays through", addDays(calendarDateIn(new Date(), "Asia/Kolkata"), 30));
  await payment.getByLabel("Reference").fill("NEFT UTR 412345678901");
  await shoot(page, "console-record-payment");
  await payment.getByRole("button", { name: "Record the payment" }).click();
  await expect(payment).toHaveCount(0);
  // The pointer would rest on the toast that comes up where the footer's button was, and hold it open.
  await page.mouse.move(0, 0);
  await expect(subscription.getByText("NEFT UTR 412345678901")).toBeVisible();
  await shoot(page, "console-organization");
  await subscription.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("menuitem", { name: "Change plan" }).click();
  const changePlan = page.getByRole("dialog", { name: "Change the plan" });
  await expect(changePlan).toBeVisible();
  await shoot(page, "console-change-plan");
  await page.keyboard.press("Escape");
  await expect(changePlan).toHaveCount(0);
  await members.getByRole("button", { name: `Sign in as ${agency.owner.name}` }).click();
  const impersonate = page.getByRole("alertdialog", { name: `Sign in as ${agency.owner.name}?` });
  await expect(impersonate).toBeVisible();
  await shoot(page, "console-impersonate");
  await page.keyboard.press("Escape");
  await expect(impersonate).toHaveCount(0);

  await page.goto("/console/plans");
  await expect(page.getByText("Everything (tests)").first()).toBeVisible();
  await shoot(page, "console-plans");
  await page.getByRole("button", { name: "New plan" }).click();
  const newPlan = page.getByRole("dialog", { name: "New plan" });
  await expect(newPlan).toBeVisible();
  await shoot(page, "console-plan-dialog");
  await page.keyboard.press("Escape");
  await expect(newPlan).toHaveCount(0);
  await page.getByRole("button", { name: "Change the policy" }).click();
  const policy = page.getByRole("dialog", { name: "Change the policy" });
  await expect(policy.getByLabel("Days past due")).not.toHaveValue("");
  await shoot(page, "console-policy-dialog");
  await page.keyboard.press("Escape");
  await expect(policy).toHaveCount(0);

  await page.goto("/console/jobs");
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: failedQueue })).toBeVisible();
  await expect(page.getByRole("region", { name: "Schedules" }).getByText(leftoverQueue)).toBeVisible();
  await shoot(page, "console-jobs");

  await page.goto("/console/log");
  await expect(page.getByRole("heading", { level: 1, name: "Platform log" })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "What changed" }).first().click();
  await shoot(page, "console-log");

  await page.goto("/console/staff");
  await expect(recordWith(page, testInfo, superAdmin.email)).toBeVisible();
  await shoot(page, "console-staff");
  await page.getByRole("button", { name: "Add platform staff" }).click();
  const form = page.getByRole("dialog", { name: "Add platform staff" });
  await form.getByLabel("Full name").fill("Neha Joshi");
  await form.getByLabel("Email").fill(`neha-${uniqueSuffix()}@platform.test`);
  await shoot(page, "console-staff-add");
  await form.getByRole("button", { name: "Add", exact: true }).click();
  const handover = page.getByRole("dialog", { name: "Neha Joshi was added" });
  await expect(handover).toBeVisible();
  await shoot(page, "console-staff-handover");
  await handover.getByRole("button", { name: "Done" }).click();
  await expect(handover).toHaveCount(0);

  await page.goto(`/console/organizations/${agency.organizationId}/data-protection`);
  await expect(page.getByRole("heading", { level: 1, name: "Data protection" })).toBeVisible();
  await page.getByRole("button", { name: "Export everything" }).click();
  // The export is a job of the console process's, which takes its turn.
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: "Ready" })).toBeVisible({
    timeout: 60_000,
  });
  await shoot(page, "console-data-protection");
});

test("support's console, and support signed in as the agency's Owner", async ({ page, support, agency }) => {
  await signInToConsole(page, support);
  await page.goto("/console");
  await expect(page.getByRole("main").locator('a[href^="/console/organizations/"]').first()).toBeVisible();
  await shoot(page, "console-dashboard-support");
  await page.goto(`/console/organizations/${agency.organizationId}`);
  const members = page.getByRole("region", { name: "Members" });
  await expect(members.getByText(agency.owner.email)).toBeVisible();
  await shoot(page, "console-organization-support");

  await members.getByRole("button", { name: `Sign in as ${agency.owner.name}` }).click();
  await page
    .getByRole("alertdialog", { name: `Sign in as ${agency.owner.name}?` })
    .getByRole("button", { name: `Sign in as ${agency.owner.name}` })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  await expect(page.getByText(`You're signed in as ${agency.owner.name} at ${agency.name}.`)).toBeVisible();
  await shoot(page, "impersonating");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
});
