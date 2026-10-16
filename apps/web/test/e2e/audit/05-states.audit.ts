// The visual audit's states, on each side: an empty list; an error with Try again, its call refused with page.route
// as an unreachable api would; and a skeleton, its call held unanswered. Each screen is opened from the navigation
// after another has loaded, so only its own call is refused or held, never the session's.
import type { Route } from "@playwright/test";
import { expect, signInToConsole, test } from "../support/console";
import { uniqueSuffix } from "../support/console-platform";
import { signInByEmail } from "../support/fixtures";
import { openFromNavigation, screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

/** The tRPC calls under `prefix` that ask for `procedure`, alone or batched with others. */
function callsTo(prefix: string, procedure: string): (url: URL) => boolean {
  return (url) => url.pathname.startsWith(prefix) && url.pathname.slice(prefix.length).split(",").includes(procedure);
}

test("an agency's states: an empty list, an error with Try again, a skeleton", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/settings/files");
  await expect(page.getByText("No files yet.", { exact: false })).toBeVisible();
  await shoot(page, "agency-empty");

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  await page.route(callsTo("/api/trpc/", "roles.list"), (route) => route.abort());
  await openFromNavigation(page, "Main", "Roles");
  // An unanswered call is tried twice more before the screen gives up.
  await expect(page.getByRole("main").getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 15_000 });
  await shoot(page, "agency-error");
  await page.unrouteAll();

  const held: Route[] = [];
  await page.route(callsTo("/api/trpc/", "staff.list"), (route) => {
    held.push(route);
  });
  await openFromNavigation(page, "Main", "Staff");
  await shoot(page, "agency-skeleton", { skeleton: true });
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("the console's states: an empty list, an error with Try again, a skeleton", async ({ page, superAdmin }) => {
  await signInToConsole(page, superAdmin);
  await page.goto("/console/jobs");
  const queue = `probe.audit-${uniqueSuffix()}`;
  await page.getByLabel("Queue").fill(queue);
  await page.getByRole("button", { name: "Show this queue" }).click();
  await expect(page.getByText(`No failed jobs on ${queue}.`)).toBeVisible();
  await shoot(page, "console-empty");

  await page.route(callsTo("/api/platform/trpc/", "plans.list"), (route) => route.abort());
  await openFromNavigation(page, "Console", "Plans");
  await expect(page.getByRole("main").getByRole("button", { name: "Try again" }).first()).toBeVisible({
    timeout: 15_000,
  });
  await shoot(page, "console-error");
  await page.unrouteAll();

  const held: Route[] = [];
  await page.route(callsTo("/api/platform/trpc/", "log.list"), (route) => {
    held.push(route);
  });
  await openFromNavigation(page, "Console", "Log");
  await shoot(page, "console-skeleton", { skeleton: true });
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
