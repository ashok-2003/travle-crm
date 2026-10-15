// Steps the journeys of the console's platform screens share: opening a screen as platform staff, finding one record
// on it as a phone or a desktop shows it, and names of a journey's own, since plans, jobs and the platform log are the
// whole platform's, seen by every journey running at once.
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { signInToConsole, type PlatformStaff } from "./console";

/** Signs platform staff in, opens a console screen and waits for its heading. */
export async function openConsoleScreen(page: Page, staff: PlatformStaff, path: string, heading: string) {
  await signInToConsole(page, staff);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

/**
 * The table row on a desktop, or the list item on a phone, that holds the text, within the page's main region (a
 * toast is a list item too) or a part of it.
 */
export function recordWith(scope: Page | Locator, testInfo: TestInfo, text: string): Locator {
  const within = "goto" in scope ? scope.getByRole("main") : scope;
  return within.getByRole(testInfo.project.name === "phone" ? "listitem" : "row").filter({ hasText: text });
}

/** Eight characters of this journey's own, for names no other journey running at once has. */
export function uniqueSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}
