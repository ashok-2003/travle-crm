// The audit log (spec 9.5): an Owner changes what a role may do, and the audit log shows who did it, when, and what
// the role gained, in words, then that role's history alone; a role that may read the audit log but not change
// settings reaches it from its own navigation item.
import type { Page, TestInfo } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { expect, signInByCode, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";

const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";

/** The navigation as the person sees it: the sidebar on a desktop, the bottom bar on a phone. */
const navigation = (page: Page) => page.getByRole("navigation", { name: "Main" }).filter({ visible: true });

/** The entries of the audit log that read `sentence`. */
const changes = (page: Page, sentence: string) =>
  page.getByRole("list", { name: "Changes" }).getByRole("listitem").filter({ hasText: sentence });

test("an Owner changes a role's permissions, and the audit log shows who, when, and before and after", async ({
  page,
  agency,
}, testInfo) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/roles");
  await page.getByRole("link", { name: /^Sales/ }).click();
  await page.getByRole("checkbox", { name: "See the audit log" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Sales was saved")).toBeVisible();

  // An Owner's bottom bar is full (Home, Staff, Roles, Settings): on a phone the audit log is under More.
  if (isPhone(testInfo)) {
    await navigation(page).getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: agency.name }).getByRole("link", { name: "Audit log" }).click();
  } else {
    await navigation(page).getByRole("link", { name: "Audit log" }).click();
  }
  await expect(page).toHaveURL(/\/settings\/audit$/);
  await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
  const change = changes(page, "Changed a role");
  await expect(change).toHaveCount(1);
  await expect(change).toContainText(`${agency.owner.name} ·`);
  await expect(change).toContainText("Web app");
  await expect(change.locator("time")).toHaveText(/^\d{1,2} [A-Z][a-z]{2}, \d{1,2}:\d{2} [ap]m$/);
  // The Owner's own account came with the organization, made by no one.
  await expect(changes(page, "Added a staff member")).toContainText("Automatic ·");

  // The entry's title opens what changed, in words: Sales gained the audit log, and what it kept doesn't show.
  await change.getByRole("button", { name: /see what changed/ }).click();
  await expect(change.getByText("What the role allows", { exact: true })).toBeVisible();
  await expect(change.getByText("See the audit log", { exact: true })).toBeVisible();
  await expect(change.getByText(/leads:view|audit:view/)).toHaveCount(0);
  await expect(change.getByText(/^See leads/)).toHaveCount(0);
  await animationsSettled(page);
  await expectAccessible(page);

  await change.getByRole("link", { name: "This role's history" }).click();
  await expect(page).toHaveURL(/\/settings\/audit\?entityType=role&entityId=[0-9a-f-]{36}$/);
  await expect(page.getByText("The history of one role")).toBeVisible();
  await expect(page.getByRole("list", { name: "Changes" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("link", { name: "Show every change" }).click();
  await expect(changes(page, "Added a staff member")).toHaveCount(1);
});

test("a role that may read the audit log, but not change settings, finds it in the navigation", async ({
  page,
  agency,
  addStaff,
  baseURL,
}) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByEmail(page, agency.owner);
  const granted = await page.request.post("/api/trpc/roles.update", {
    data: { key: "sales", permissions: [{ permission: "audit:view" }] },
    // The api accepts changes only from the web app's own origin, which a browser would send.
    headers: { origin: baseURL ?? "" },
  });
  expect(granted.ok()).toBe(true);

  await signInByCode(page, { code: agency.code, staff: ravi });
  await page.goto("/");
  await expect(navigation(page).getByRole("link", { name: "Settings" })).toHaveCount(0);
  await navigation(page).getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
  await expect(changes(page, "Changed a role")).toContainText(`${agency.owner.name} ·`);
  await expect(navigation(page).getByRole("link", { name: "Audit log" })).toHaveAttribute("aria-current", "page");
});
