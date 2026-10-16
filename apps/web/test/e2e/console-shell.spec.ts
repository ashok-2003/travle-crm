// The console at /console (ADR 0019): a signed-out visitor signs in and comes back to it, platform staff who sign in
// on the one sign-in page land on its dashboard, support sees no Staff destination, an agency's Owner is told it
// isn't theirs, and support stops impersonating from the agency's banner, back in the console. Each journey's last
// screen also gets the automatic accessibility check (support/accessible-after-each.ts).
import type { Page, TestInfo } from "@playwright/test";
import { expect, signInToConsole, test, type PlatformStaff } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import { totpCode } from "./support/totp";

const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";

/** Signs in on the sign-in screen: the email and password, then the code from the authenticator app. */
async function signInOnScreen(page: Page, staff: PlatformStaff): Promise<void> {
  await page.getByRole("textbox", { name: "Email" }).fill(staff.email);
  await page.getByLabel("Password", { exact: true }).fill(staff.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Code from your authenticator app").fill(totpCode(staff.totpSecret));
  await page.getByRole("button", { name: "Continue" }).click();
}

const dashboardHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Dashboard" });

test("a signed-out visitor to the console signs in and comes back to it", async ({ page, support }) => {
  await page.goto("/console");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fconsole$/);
  await signInOnScreen(page, support);
  await expect(dashboardHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page).toHaveTitle(/^Dashboard · Console · /);
});

test("platform staff who sign in on the sign-in page land on the dashboard, every organization on it", async ({
  page,
  superAdmin,
  agency,
}) => {
  await page.goto("/sign-in");
  await signInOnScreen(page, superAdmin);
  await expect(dashboardHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/console$/);
  // Oldest first, a page at a time: this journey's agency is among the newest. Its code tells it from the others.
  const organization = page.getByRole("link").filter({ hasText: agency.code });
  const showMore = page.getByRole("button", { name: "Show more organizations" });
  while (!(await organization.isVisible())) {
    await expect(showMore.or(organization)).toBeVisible();
    if (await showMore.isVisible()) await showMore.click();
  }
  await expect(organization).toHaveAttribute("href", `/console/organizations/${agency.organizationId}`);
  await expect(organization).toContainText(agency.name);
});

async function destinations(page: Page, testInfo: TestInfo): Promise<string[]> {
  if (!isPhone(testInfo)) {
    return page
      .getByRole("navigation", { name: "Console" })
      .filter({ visible: true })
      .getByRole("link")
      .allTextContents();
  }
  const bar = await page
    .getByRole("navigation", { name: "Console" })
    .filter({ visible: true })
    .getByRole("link")
    .allTextContents();
  await page.getByRole("button", { name: "More" }).click();
  const more = await page.getByRole("dialog").getByRole("link").allTextContents();
  return [...bar, ...more];
}

test("support sees every destination but Staff, a super admin sees Staff too", async ({
  page,
  support,
  superAdmin,
}, testInfo) => {
  await signInToConsole(page, superAdmin);
  await page.goto("/console");
  await expect(dashboardHeading(page)).toBeVisible();
  expect(await destinations(page, testInfo)).toEqual(["Dashboard", "Onboard", "Plans", "Jobs", "Log", "Staff"]);

  await page.context().clearCookies();
  await page.goto("/console");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fconsole$/);
  await signInToConsole(page, support);
  await page.goto("/console");
  await expect(dashboardHeading(page)).toBeVisible();
  expect(await destinations(page, testInfo)).toEqual(["Dashboard", "Onboard", "Plans", "Jobs", "Log"]);
  // At the foot of the sidebar, or atop the phone's More sheet, which destinations() left open.
  await expect(page.getByText("Arjun Nair").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Support", { exact: true }).filter({ visible: true })).toBeVisible();
});

test("an agency's Owner opening the console is told it isn't theirs", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/console");
  await expect(page.getByText("This console is for platform staff.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(dashboardHeading(page)).toHaveCount(0);
});

test("support stops impersonating from the agency's banner, back in the console", async ({
  page,
  support,
  agency,
  database,
}) => {
  await signInToConsole(page, support);
  const owner = await database.platform.user.findUniqueOrThrow({ where: { email: agency.owner.email } });
  const started = await page.request.post("/api/auth/admin/impersonate-user", {
    data: { userId: owner.id },
    headers: { origin: process.env.E2E_BASE_URL ?? "" },
  });
  expect(started.ok()).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  await expect(page.getByText("Support is signed in as you.")).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(dashboardHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/console$/);
});
